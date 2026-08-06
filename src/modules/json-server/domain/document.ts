import { getByteLength } from "@/modules/tools/domain/byte-size";
import { parseJson } from "@/modules/tools/domain/json-parser";
import type { JsonNode } from "@/modules/tools/types/json-tree";

import {
    MAX_COLLECTIONS,
    MAX_DOCUMENT_DEPTH,
    MAX_ITEMS_PER_COLLECTION,
    MAX_RESOURCE_NAME_LENGTH,
    MAX_UPLOAD_BYTES,
    RESOURCE_NAME_PATTERN,
} from "./constants";
import { nextId } from "./identity";
import type {
    DocumentResult,
    JsonDocument,
    JsonObject,
    JsonValue,
    ResourceKind,
    ResourceSummary,
} from "../types";

/**
 * Reading a `db.json` somebody supplied, and deciding what it publishes.
 *
 * Two things make this more than a `JSON.parse`.
 *
 * **The failure has to point at a line.** This is the one moment a *person* is
 * looking at the document rather than a program, and "invalid JSON" with no
 * coordinates is the difference between fixing a stray comma in ten seconds and
 * hunting it. The hand-written reader in `tools/domain/json-parser.ts` is what
 * makes that possible — and, per the rule the BSON module wrote down, it is also
 * the only way to say anything at all about *where*: `JSON.parse`'s message is
 * host-derived, so rendering one would disagree between the server pass and the
 * hydration pass.
 *
 * **Ids are the contract.** `json-server` v1 made every id a string and
 * generates one when a record arrives without it. A document written for v0 has
 * integer ids throughout, and quietly leaving them as numbers would make
 * `GET /posts/1` miss a record whose id is `1`. So ids are coerced on the way
 * in, once, and the count of what changed is reported rather than hidden — a
 * fixture whose ids moved under its owner deserves a sentence.
 *
 * The third rule is what this file *refuses* to decide. A top-level array of
 * objects is a collection and gets ids; anything else — a lone object, a list of
 * strings, a number — is kept exactly as it arrived and served on `GET`. The
 * alternative is refusing a document over `{"tags": ["a", "b"]}`, which would be
 * the tool telling somebody what their data may look like.
 */

/** Whether a top-level key can appear in a URL as written. */
export function isRoutableName(name: string): boolean {
    return name.length <= MAX_RESOURCE_NAME_LENGTH && RESOURCE_NAME_PATTERN.test(name);
}

/**
 * Whether a document is already too big to send, without parsing it.
 *
 * The editor's own verdict and every submit button's disabled state read this
 * one function, so a box that says "too large" can never sit above a button
 * that will happily post it. `readDocument` applies the same ceiling on the way
 * in — this is only the cheap half, pulled out so the UI can ask on every
 * keystroke.
 */
export function exceedsUploadLimit(input: string, maxBytes = MAX_UPLOAD_BYTES): boolean {
    return getByteLength(input) > maxBytes;
}

/**
 * Reads text into a document, or says where it went wrong.
 *
 * Ordered cheapest-first for the usual reason: an empty box and a document over
 * the ceiling both refuse before the parser walks a megabyte of text.
 */
export function readDocument(input: string, maxBytes = MAX_UPLOAD_BYTES): DocumentResult {
    if (input.trim().length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (getByteLength(input) > maxBytes) {
        return { ok: false, reason: "too_large" };
    }

    // Repair off: this document is going to be served to other programs, and a
    // comma the studio silently inserted is a difference between what somebody
    // pasted and what their client receives. The JSON Formatter offers repair
    // because its job is to hand the text back; this one's job is to store it.
    const parsed = parseJson(input, false);

    if (!parsed.ok) {
        return {
            ok: false,
            reason: parsed.error.code === "too_deep" ? "too_deep" : "invalid_json",
            line: parsed.error.line,
            column: parsed.error.column,
        };
    }

    if (parsed.root.kind !== "object") {
        return { ok: false, reason: "not_an_object" };
    }

    const document: JsonObject = {};

    // A duplicate key is legal JSON and the last one wins, which is what every
    // reader does. The JSON Formatter reports it as an advisory, because there
    // the text is the product; here it simply resolves.
    for (const member of parsed.root.members) {
        document[member.key] = toValue(member.value);
    }

    return normalizeDocument(document, maxBytes);
}

/**
 * The same checks over a value that is already a value — a stored row on its way
 * back out, or a document the studio built itself.
 *
 * Shares every rule with `readDocument` and skips only the parse, so a row that
 * predates a tightened limit is caught on the way out rather than serving
 * something the reader would now refuse.
 */
export function checkDocument(value: unknown, maxBytes = MAX_UPLOAD_BYTES): DocumentResult {
    if (!isPlainObject(value as JsonValue)) {
        return { ok: false, reason: "not_an_object" };
    }

    return normalizeDocument(value as JsonObject, maxBytes);
}

type IdCounts = { generated: number; coerced: number };

function normalizeDocument(document: JsonObject, maxBytes: number): DocumentResult {
    const keys = Object.keys(document);

    if (keys.length > MAX_COLLECTIONS) {
        return { ok: false, reason: "too_many_collections" };
    }

    if (valueDepth(document, 0) > MAX_DOCUMENT_DEPTH) {
        return { ok: false, reason: "too_deep" };
    }

    const counts: IdCounts = { generated: 0, coerced: 0 };
    const normalized: JsonObject = {};

    for (const key of keys) {
        const value = document[key];

        if (Array.isArray(value) && value.length > MAX_ITEMS_PER_COLLECTION) {
            return { ok: false, reason: "too_many_items", resource: key };
        }

        // Only a collection gets ids. Everything else — a singular object, a
        // list of scalars, a bare number — is stored exactly as it arrived.
        if (resourceKind(value) !== "collection") {
            normalized[key] = value;
            continue;
        }

        const items: JsonValue[] = [];
        const seen = new Set<string>();

        for (const item of value as JsonObject[]) {
            const record = normalizeId(item, seen, counts);

            if (record === null) {
                return { ok: false, reason: "duplicate_id", resource: key };
            }

            items.push(record);
        }

        normalized[key] = items;
    }

    const text = writeDocument(normalized);
    const bytes = getByteLength(text);

    // Measured after normalisation, not before: generated ids make a document
    // bigger, and accepting one that only fit before they were added would
    // store a row already over its own ceiling.
    if (bytes > maxBytes) {
        return { ok: false, reason: "too_large" };
    }

    return {
        ok: true,
        document: normalized,
        text,
        bytes,
        resources: summarize(normalized),
        generatedIds: counts.generated,
        coercedIds: counts.coerced,
    };
}

/**
 * The tree, flattened to plain data.
 *
 * Number literals become JavaScript numbers here, and that is the one thing this
 * loses which the JSON Formatter keeps: an integer past 2^53 rounds. It is
 * unavoidable — the document is stored as JSONB and served through
 * `JSON.stringify`, both of which are doubles — so the honest thing is to say so
 * in the article rather than pretend the literal survives.
 */
function toValue(node: JsonNode): JsonValue {
    switch (node.kind) {
        case "null":
            return null;
        case "boolean":
            return node.value;
        case "number":
            return Number(node.raw);
        case "string":
            return node.value;
        case "array":
            return node.items.map(toValue);
        case "object": {
            const object: JsonObject = {};

            for (const member of node.members) {
                object[member.key] = toValue(member.value);
            }

            return object;
        }
    }
}

/**
 * Ids, made to match `json-server` v1.
 *
 * A non-empty string id is kept. A number or a boolean becomes its string
 * spelling — which is what makes `GET /posts/1` find a record stored as
 * `{"id": 1}`. Anything else, including an absent id, gets a fresh one. A record
 * whose id repeats one already in the collection is refused rather than renamed,
 * because two records answering to the same address is the one state no amount
 * of later editing recovers from.
 */
function normalizeId(record: JsonObject, seen: Set<string>, counts: IdCounts): JsonObject | null {
    const raw = record.id;
    let id: string;

    if (typeof raw === "string" && raw.length > 0) {
        id = raw;
    } else if (typeof raw === "number" || typeof raw === "boolean") {
        id = String(raw);
        counts.coerced += 1;
    } else {
        id = nextId(seen);
        counts.generated += 1;
    }

    if (seen.has(id)) {
        return null;
    }

    seen.add(id);

    // `id` first, because a record read back should look like the one that was
    // written and every `json-server` fixture leads with it.
    return { ...record, id };
}

export function isPlainObject(value: JsonValue): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueDepth(value: JsonValue, depth: number): number {
    if (depth > MAX_DOCUMENT_DEPTH) {
        return depth;
    }

    if (Array.isArray(value)) {
        let deepest = depth;

        for (const item of value) {
            deepest = Math.max(deepest, valueDepth(item, depth + 1));

            if (deepest > MAX_DOCUMENT_DEPTH) {
                return deepest;
            }
        }

        return deepest;
    }

    if (isPlainObject(value)) {
        let deepest = depth;

        for (const key of Object.keys(value)) {
            deepest = Math.max(deepest, valueDepth(value[key], depth + 1));

            if (deepest > MAX_DOCUMENT_DEPTH) {
                return deepest;
            }
        }

        return deepest;
    }

    return depth;
}

/**
 * The canonical text of a document: two-space indent, key order preserved.
 *
 * One writer for the editor, the size measurement and the stored row, so what a
 * visitor is shown is byte-for-byte what is being counted against their limit.
 * Anything else and the usage bar would disagree with the box above it.
 */
export function writeDocument(document: JsonDocument): string {
    return JSON.stringify(document, null, 2);
}

/** The same, minified — what a request to the API gets back. */
export function writeCompact(value: JsonValue): string {
    return JSON.stringify(value);
}

export function documentBytes(document: JsonDocument): number {
    return getByteLength(writeDocument(document));
}

/**
 * What kind of resource a top-level value is.
 *
 * An **empty array is a collection**, and that matters more than it looks:
 * `{"posts": []}` is exactly how somebody starts a server they intend to `POST`
 * into, and reading it as opaque would leave them unable to add the first
 * record.
 */
export function resourceKind(value: JsonValue): ResourceKind {
    if (Array.isArray(value)) {
        return value.every(isPlainObject) ? "collection" : "opaque";
    }

    return isPlainObject(value) ? "singular" : "opaque";
}

export function summarize(document: JsonDocument): readonly ResourceSummary[] {
    return Object.keys(document).map((name) => {
        const value = document[name];
        const kind = resourceKind(value);

        return {
            name,
            kind,
            count: kind === "collection" ? (value as JsonValue[]).length : 0,
            routable: isRoutableName(name),
            fields:
                kind === "collection"
                    ? fieldsOf(value as JsonObject[])
                    : isPlainObject(value)
                      ? Object.keys(value)
                      : [],
        };
    });
}

/**
 * Keys seen across a collection, in first-seen order.
 *
 * Sampled from the first fifty records rather than all of them. A collection is
 * capped at ten thousand and this runs on every studio load; the fifty-first
 * record introducing a key nothing else has is not worth the other 9,950 reads,
 * and the list is a hint for building a query rather than a schema.
 */
function fieldsOf(records: readonly JsonObject[]): readonly string[] {
    const fields: string[] = [];

    for (const record of records.slice(0, 50)) {
        for (const key of Object.keys(record)) {
            if (!fields.includes(key)) {
                fields.push(key);
            }
        }
    }

    return fields;
}
