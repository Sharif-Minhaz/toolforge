import type { JsonObject, JsonValue } from "../types";

/**
 * Record ids: how one is drawn, and how a record is found by one.
 *
 * `json-server` v1's rule is short and worth stating exactly, because getting
 * either half wrong is invisible until somebody's client cannot find a record it
 * just created: **an id is always a string**, and one is generated when a record
 * arrives without it.
 *
 * The generator here is not `json-server`'s. It uses `nanoid`, which is a
 * dependency and a random source; this draws the next free integer instead, as
 * a string. Two reasons, and the second is the important one:
 *
 * - **A fixture is easier to read.** `POST` into a fresh `posts` and the record
 *   comes back as `"3"`, not `"V1StGXR8_Z5jdHi6B-myT"`. Somebody hand-writing
 *   the next request against it can type the id from memory.
 * - **It is deterministic, so the whole engine is.** Every other value the
 *   serving path produces is a pure function of the document and the request.
 *   An id drawn from `Math.random` would make `serve` untestable without
 *   injecting a random source through six call sites, and `crypto` would make it
 *   unrunnable in a plain unit test. The counter is derived from the collection
 *   itself, so the same document plus the same request gives the same id every
 *   time.
 *
 * The cost is that ids are guessable. That is correct here and would not be
 * anywhere else on this site: a mock database's record ids are not a secret —
 * the whole collection is readable at `GET /posts` by anyone with the address —
 * so an unguessable id would be protecting nothing. Where something must not be
 * guessable, this repository draws from `crypto.getRandomValues`; see
 * `tools/domain/browser-secret.ts`.
 */

/**
 * The next id not already taken.
 *
 * Counts up from 1 rather than from `seen.size`, so a collection holding
 * `["1", "5"]` yields `"2"` and never collides. Linear in the number of records,
 * which is bounded by `MAX_ITEMS_PER_COLLECTION`.
 */
export function nextId(seen: ReadonlySet<string>): string {
    let candidate = 1;

    while (seen.has(String(candidate))) {
        candidate += 1;
    }

    return String(candidate);
}

/** Every id currently in a collection. */
export function idsOf(records: readonly JsonValue[]): Set<string> {
    const ids = new Set<string>();

    for (const record of records) {
        const id = idOf(record);

        if (id !== null) {
            ids.add(id);
        }
    }

    return ids;
}

/**
 * A record's id as a string, or `null` when it has none.
 *
 * Reads a number as its string spelling as well as a string, because a record
 * `POST`ed with `{"id": 7}` by somebody's client has to be findable at
 * `/posts/7`. The stored document is normalised, but this also runs over a body
 * that has not been through the reader yet.
 */
export function idOf(record: JsonValue): string | null {
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
        return null;
    }

    const raw = (record as JsonObject).id;

    if (typeof raw === "string") {
        return raw.length > 0 ? raw : null;
    }

    if (typeof raw === "number" || typeof raw === "boolean") {
        return String(raw);
    }

    return null;
}

/** Index of the record answering to `id`, or `-1`. */
export function findIndexById(records: readonly JsonValue[], id: string): number {
    return records.findIndex((record) => idOf(record) === id);
}
