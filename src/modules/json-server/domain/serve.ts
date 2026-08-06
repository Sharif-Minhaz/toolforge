import { getByteLength } from "@/modules/tools/domain/byte-size";
import {
    MAX_DOCUMENT_BYTES,
    MAX_ITEMS_PER_COLLECTION,
} from "@/modules/tools/domain/document-limits";
import {
    isPlainObject,
    resourceKind,
    writeCompact,
    writeDocument,
} from "@/modules/tools/domain/json-document";
import { findIndexById, idOf, idsOf, nextId } from "@/modules/tools/domain/record-id";
import type { JsonDocument, JsonObject, JsonValue } from "@/modules/tools/types/json-document";

import { embedInto, embedTargets, foreignKeyFor, readPath, runQuery } from "./query";
import { allowedMethods, isGrowingMethod, parsePath, type PathTarget } from "./routes";
import type { HttpMethod, ServeError, ServeOutcome, ServeRequest } from "../types";

/**
 * The whole `json-server` engine, as one pure function.
 *
 * `(request, document) → (response, next document | null)`. Nothing here reads a
 * clock, a socket, a random source or an environment variable, which is what
 * makes every route and every operator testable without a database — and it is
 * the same seam the Mock Server Studio draws between `domain/execute.ts` and the
 * repository that feeds it.
 *
 * `document` coming back `null` is load-bearing rather than tidy: it is how the
 * repository knows a request changed nothing and can be answered from a plain
 * read instead of a row lock. A `GET` must never pay for a transaction.
 *
 * Three behaviours here are `json-server`'s and are easy to get subtly wrong:
 *
 * - **`PUT` replaces, `PATCH` merges.** A `PUT` that quietly kept fields the
 *   body omitted would make it impossible to remove one.
 * - **The id is never taken from the body on a write to an existing record.**
 *   `PATCH /posts/1` with `{"id": "9"}` updates post 1 and leaves its id alone.
 *   Honouring it would move a record to an address the caller did not request
 *   and silently orphan everything referring to it.
 * - **`POST` returns 201 with a `Location`**, and the created record — including
 *   the id that was generated for it, which is the only way the caller learns
 *   what to ask for next.
 */

function json(status: number, value: JsonValue, extra: (readonly [string, string])[] = []) {
    return {
        status,
        body: writeCompact(value),
        headers: extra,
        document: null,
        bytes: 0,
    } satisfies ServeOutcome;
}

/**
 * A refusal in one shape every time, so a caller debugging an integration can
 * tell a ToolForge answer from their own server's.
 */
function fail(
    status: number,
    error: ServeError,
    extra: (readonly [string, string])[] = [],
): ServeOutcome {
    return json(status, { error, status }, extra);
}

function written(
    status: number,
    value: JsonValue,
    document: JsonDocument,
    extra: (readonly [string, string])[] = [],
): ServeOutcome {
    const text = writeDocument(document);

    return {
        status,
        body: writeCompact(value),
        headers: extra,
        document,
        // Measured from the same writer the studio's usage bar reads, so the
        // number stored and the number shown cannot disagree.
        bytes: getByteLength(text),
    };
}

export function serve(
    request: ServeRequest,
    document: JsonDocument,
    storedBytes: number,
): ServeOutcome {
    const target = parsePath(request.path);
    const allowed = allowedMethods(document, target);

    if (allowed.length === 0) {
        return fail(404, "not_found");
    }

    if (request.method === "OPTIONS") {
        // A preflight nobody defined, answered from what the path supports.
        return {
            status: 204,
            body: "",
            headers: [
                ["allow", allowed.join(", ")],
                ["access-control-allow-methods", allowed.join(", ")],
            ],
            document: null,
            bytes: 0,
        };
    }

    // HEAD falls through to GET and the body is stripped by the caller, because
    // HTTP defines it that way and making it a separate branch is two things to
    // keep in step.
    const method: HttpMethod = request.method === "HEAD" ? "GET" : request.method;

    if (!allowed.includes(method)) {
        return fail(405, "method_not_allowed", [["allow", allowed.join(", ")]]);
    }

    /**
     * The size lock.
     *
     * Only the methods that can *grow* the document are refused, and the gate is
     * here rather than in the repository so it is one branch covered by the same
     * unit tests as everything else. `DELETE` deliberately passes: it is the way
     * out of a full server, and a ceiling with no exit is a trap.
     */
    if (isGrowingMethod(method) && storedBytes >= MAX_DOCUMENT_BYTES) {
        return fail(507, "document_full");
    }

    if (target.kind === "root") {
        // The whole document, which is what `json-server` serves at `/`.
        return json(200, document);
    }

    return method === "GET"
        ? read(request, document, target)
        : write(request, document, target, method);
}

// ─── reading ────────────────────────────────────────────────────────────────

function read(request: ServeRequest, document: JsonDocument, target: PathTarget): ServeOutcome {
    if (target.kind === "unknown" || target.kind === "root") {
        return fail(404, "not_found");
    }

    const value = document[target.resource];
    const kind = resourceKind(value);

    if (target.kind === "record") {
        const records = value as JsonValue[];
        const index = findIndexById(records, target.id);

        if (index < 0) {
            return fail(404, "not_found");
        }

        // `_embed` works on a single record too, which is easy to miss: the
        // reference threads the whole query into `findById` for exactly this.
        const embedded = embedTargets(request.query).reduce<JsonValue>(
            (carried, name) => embedInto(carried, target.resource, name, document),
            records[index],
        );

        return json(200, embedded);
    }

    if (kind !== "collection") {
        // A singular resource or an opaque value: no filtering, no paging —
        // there is no list to filter. Returned as it stands.
        return json(200, value);
    }

    // The resource and the document are threaded in because `_embed` runs
    // *before* filtering and sorting — see `runQuery`.
    const outcome = runQuery(value as JsonValue[], request.query, target.resource, document);

    if (!outcome.ok) {
        return fail(400, "invalid_query");
    }

    if (outcome.paginated) {
        const { first, prev, next, last, pages, items, data } = outcome.page;

        // Spelled out rather than spread, so the envelope's shape is this
        // file's promise and not whatever `Pagination` happens to carry.
        return json(200, { first, prev, next, last, pages, items, data: [...data] });
    }

    const { data } = outcome;

    // `X-Total-Count` on an unpaginated list, which is what every `json-server`
    // client reaches for to render "showing 10 of 200" without a second call.
    return json(200, [...data], [["x-total-count", String(data.length)]]);
}

// ─── writing ────────────────────────────────────────────────────────────────

function write(
    request: ServeRequest,
    document: JsonDocument,
    target: PathTarget,
    method: HttpMethod,
): ServeOutcome {
    if (target.kind === "unknown" || target.kind === "root") {
        return fail(404, "not_found");
    }

    const value = document[target.resource];
    const kind = resourceKind(value);

    if (kind === "singular") {
        return writeSingular(request, document, target.resource, method);
    }

    if (kind !== "collection") {
        return fail(405, "method_not_allowed");
    }

    const records = value as JsonObject[];

    if (target.kind === "resource") {
        return method === "POST"
            ? create(request, document, target.resource, records)
            : fail(405, "method_not_allowed");
    }

    const index = findIndexById(records, target.id);

    if (index < 0) {
        return fail(404, "not_found");
    }

    if (method === "DELETE") {
        return remove(request, document, target.resource, records, index);
    }

    const body = readBody(request.body);

    if (body === null) {
        return fail(400, "invalid_json_body");
    }

    if (!isPlainObject(body)) {
        return fail(400, "body_not_an_object");
    }

    const existing = records[index];
    // The id is the record's address, not a field the body may move. See the
    // note at the head of this file.
    const updated: JsonObject =
        method === "PUT" ? { ...body, id: existing.id } : { ...existing, ...body, id: existing.id };

    const next = replaceAt(document, target.resource, records, index, updated);

    return written(200, updated, next);
}

function create(
    request: ServeRequest,
    document: JsonDocument,
    resource: string,
    records: readonly JsonObject[],
): ServeOutcome {
    if (records.length >= MAX_ITEMS_PER_COLLECTION) {
        return fail(507, "too_many_items");
    }

    const body = readBody(request.body);

    if (body === null) {
        return fail(400, "invalid_json_body");
    }

    if (!isPlainObject(body)) {
        return fail(400, "body_not_an_object");
    }

    const taken = idsOf(records);
    const supplied = idOf(body);

    // A caller may name the id — a seeded fixture wants `{"id": "known"}` to
    // stay `"known"` — but may not reuse one. 409 rather than a silent
    // overwrite: a `POST` that replaced a record is data loss wearing a success.
    if (supplied !== null && taken.has(supplied)) {
        return fail(409, "duplicate_id");
    }

    const created: JsonObject = { ...body, id: supplied ?? nextId(taken) };
    const next: JsonDocument = { ...document, [resource]: [...records, created] };

    return written(201, created, next, [["location", `/${resource}/${created.id as string}`]]);
}

/**
 * `DELETE /posts/1`, and optionally `?_dependent=comments`.
 *
 * Two steps, and the first one happens **whether or not `_dependent` was
 * asked for**, because that is what the reference does and it is the half an
 * implementation forgets: every other collection's records that pointed at the
 * deleted id have their foreign key **set to `null`**. Skip it and a fixture
 * accumulates comments referring to posts that no longer exist, which is exactly
 * the state a relational fixture is meant to demonstrate not being in.
 *
 * `_dependent` then removes the records whose foreign key is null. Note the
 * consequence, which is the reference's and is worth knowing rather than
 * discovering: that includes records whose key was *already* null before this
 * request. A comment written with no `postId` is swept up by
 * `DELETE /posts/1?_dependent=comments`.
 *
 * Only named collections are deleted from — a cascade nobody asked for is how a
 * fixture loses half its rows.
 */
function remove(
    request: ServeRequest,
    document: JsonDocument,
    resource: string,
    records: readonly JsonObject[],
    index: number,
): ServeOutcome {
    const removed = records[index];
    const id = idOf(removed);
    const key = foreignKeyFor(resource);
    const next: JsonDocument = {
        ...document,
        [resource]: records.filter((_, position) => position !== index),
    };

    for (const name of Object.keys(next)) {
        const related = next[name];

        if (name === resource || !Array.isArray(related)) {
            continue;
        }

        next[name] = related.map((child) =>
            isPlainObject(child) && readPath(child, key) === id ? { ...child, [key]: null } : child,
        );
    }

    const dependents = request.query
        .filter(([entry]) => entry === "_dependent")
        .flatMap(([, value]) => value.split(",").map((entry) => entry.trim()))
        .filter((entry) => entry.length > 0);

    for (const dependent of dependents) {
        const related = next[dependent];

        if (dependent === resource || !Array.isArray(related)) {
            continue;
        }

        next[dependent] = related.filter((child) => readPath(child, key) !== null);
    }

    return written(200, removed, next);
}

function writeSingular(
    request: ServeRequest,
    document: JsonDocument,
    resource: string,
    method: HttpMethod,
): ServeOutcome {
    if (method !== "PUT" && method !== "PATCH") {
        return fail(405, "method_not_allowed");
    }

    const body = readBody(request.body);

    if (body === null) {
        return fail(400, "invalid_json_body");
    }

    if (!isPlainObject(body)) {
        return fail(400, "body_not_an_object");
    }

    const existing = document[resource] as JsonObject;
    const updated = method === "PUT" ? body : { ...existing, ...body };
    const next: JsonDocument = { ...document, [resource]: updated };

    return written(200, updated, next);
}

function replaceAt(
    document: JsonDocument,
    resource: string,
    records: readonly JsonObject[],
    index: number,
    record: JsonObject,
): JsonDocument {
    return {
        ...document,
        [resource]: records.map((held, position) => (position === index ? record : held)),
    };
}

/**
 * The request body, or `null` when it is not JSON.
 *
 * `JSON.parse` is correct here and the hand-written reader is not, which is the
 * mirror of the rule `document.ts` follows: there a *person* is looking at the
 * text and needs a line number; here the caller is a program that gets a 400 and
 * a code. Rendering an engine's `SyntaxError` is what CLAUDE.md forbids, and
 * nothing here does — the message is discarded and a typed error is returned.
 */
function readBody(raw: string): JsonValue | null {
    if (raw.trim().length === 0) {
        return null;
    }

    try {
        return JSON.parse(raw) as JsonValue;
    } catch {
        return null;
    }
}
