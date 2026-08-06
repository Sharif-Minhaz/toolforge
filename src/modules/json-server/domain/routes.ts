import { isRoutableName, resourceKind } from "./document";
import type { DerivedRoute, HttpMethod, JsonDocument } from "../types";

/**
 * The route table, derived from the document rather than authored.
 *
 * This is the whole promise of the tool — you supply data and the API appears —
 * so the one property that has to hold is that **the studio's route list and the
 * server's matcher come from this same function**. Two derivations would drift,
 * and the way it would show up is the worst kind: a route printed on the page
 * that answers 404.
 *
 * The shapes are `json-server`'s, and the split is the one it makes:
 *
 * - An **array of objects** is a collection: six routes, list and record.
 * - A **lone object** is singular: three routes and no id, because there is
 *   nothing to `POST` a second of and nothing to `DELETE` by.
 * - Anything else publishes **nothing**, and so does a key that could not
 *   survive being a path segment. Both are still stored and still visible in the
 *   studio, which is what stops "my data vanished" being the reading.
 */

const COLLECTION_LIST: readonly HttpMethod[] = ["GET", "POST"];

const COLLECTION_RECORD: readonly HttpMethod[] = ["GET", "PUT", "PATCH", "DELETE"];

const SINGULAR: readonly HttpMethod[] = ["GET", "PUT", "PATCH"];

/** Methods that change the document, and are therefore what a full server refuses. */
const WRITING: ReadonlySet<HttpMethod> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isWritingMethod(method: HttpMethod): boolean {
    return WRITING.has(method);
}

/**
 * Methods that make the document *bigger*.
 *
 * `DELETE` writes and is deliberately absent: the size lock has to leave a way
 * out, and deleting a record is it. A ceiling that refused every write would be
 * a trap whose only escape is discarding the whole document.
 */
const GROWING: ReadonlySet<HttpMethod> = new Set(["POST", "PUT", "PATCH"]);

export function isGrowingMethod(method: HttpMethod): boolean {
    return GROWING.has(method);
}

export function deriveRoutes(document: JsonDocument): readonly DerivedRoute[] {
    const routes: DerivedRoute[] = [];

    for (const name of Object.keys(document)) {
        if (!isRoutableName(name)) {
            continue;
        }

        const kind = resourceKind(document[name]);

        if (kind === "collection") {
            for (const method of COLLECTION_LIST) {
                routes.push({
                    method,
                    pattern: `/${name}`,
                    resource: name,
                    kind,
                    writes: isWritingMethod(method),
                });
            }

            for (const method of COLLECTION_RECORD) {
                routes.push({
                    method,
                    pattern: `/${name}/:id`,
                    resource: name,
                    kind,
                    writes: isWritingMethod(method),
                });
            }

            continue;
        }

        if (kind === "singular") {
            for (const method of SINGULAR) {
                routes.push({
                    method,
                    pattern: `/${name}`,
                    resource: name,
                    kind,
                    writes: isWritingMethod(method),
                });
            }

            continue;
        }

        // Opaque: readable, and nothing else. `GET /tags` on `["a","b"]` is a
        // useful thing to be able to do; `PATCH /tags/1` is not a thing at all.
        routes.push({ method: "GET", pattern: `/${name}`, resource: name, kind, writes: false });
    }

    return routes;
}

export type PathTarget =
    | { readonly kind: "root" }
    | { readonly kind: "resource"; readonly resource: string }
    | { readonly kind: "record"; readonly resource: string; readonly id: string }
    | { readonly kind: "unknown" };

/**
 * Splits a request path into what it names.
 *
 * **Decoded per segment, and only after splitting.** Decoding the whole path
 * first turns a `%2F` into a separator and one segment into two, which is how a
 * traversal gets through a router that reads as correct — the same rule the mock
 * studio's matcher follows. A malformed escape keeps its literal text rather
 * than failing the request, because `decodeURIComponent` throws on a lone `%`
 * and a 400 nobody asked for is a worse answer than matching what was sent.
 */
export function parsePath(path: string): PathTarget {
    const segments = path
        .split("/")
        .filter((segment) => segment.length > 0)
        .map(decodeSegment);

    if (segments.length === 0) {
        return { kind: "root" };
    }

    if (segments.length === 1) {
        return { kind: "resource", resource: segments[0] };
    }

    if (segments.length === 2) {
        return { kind: "record", resource: segments[0], id: segments[1] };
    }

    return { kind: "unknown" };
}

function decodeSegment(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * Which methods a path supports, for `Allow` and for an undefined `OPTIONS`.
 *
 * Returns an empty list when the path does not exist at all, which is what lets
 * the caller tell 404 from 405 — the distinction most hosted mock servers fold
 * together and the one a client debugging an integration actually needs.
 */
export function allowedMethods(document: JsonDocument, target: PathTarget): readonly HttpMethod[] {
    if (target.kind === "root") {
        return ["GET"];
    }

    if (target.kind === "unknown") {
        return [];
    }

    if (!isRoutableName(target.resource) || !(target.resource in document)) {
        return [];
    }

    const kind = resourceKind(document[target.resource]);

    if (kind === "collection") {
        return target.kind === "resource"
            ? [...COLLECTION_LIST, "HEAD", "OPTIONS"]
            : [...COLLECTION_RECORD, "HEAD", "OPTIONS"];
    }

    if (kind === "singular") {
        return target.kind === "resource" ? [...SINGULAR, "HEAD", "OPTIONS"] : [];
    }

    return target.kind === "resource" ? ["GET", "HEAD", "OPTIONS"] : [];
}
