import type { JsonValue } from "../types/graph";

/**
 * Reading one value out of a request.
 *
 * The path is what a person picks in the Response Builder — `user.address.city`,
 * `items[0].id` — and the whole point of the picker is that they never type
 * template syntax. This is what turns the picked path into a value.
 *
 * **Total, and null on every miss.** A path into a body that did not arrive, a
 * key that is not there, an index past the end, an array indexed by name — each
 * gives `null`. A mock that throws because the caller left out an optional field
 * is a mock that fails on exactly the request its author was trying to model.
 */

/** `a.b[0].c` → `["a", "b", "0", "c"]`. Empty for an empty path. */
export function splitJsonPath(path: string): readonly string[] {
    const trimmed = path.trim();

    if (trimmed === "") {
        return [];
    }

    const parts: string[] = [];
    let current = "";
    // Quote state has to be tracked, not just stripped: `["odd.key"]` reaches a
    // key that *contains* a dot, so inside quotes a dot is a character rather
    // than a separator. Stripping the quotes first and splitting afterwards
    // makes that key unreachable, which is the whole reason brackets exist.
    let quote: '"' | "'" | null = null;

    function flush() {
        if (current !== "") {
            parts.push(current);
            current = "";
        }
    }

    for (const character of trimmed) {
        if (quote !== null) {
            if (character === quote) {
                quote = null;
                // Flushed here, so an empty quoted key is still a step rather
                // than vanishing: `[""]` reads a key that is the empty string.
                parts.push(current);
                current = "";
                continue;
            }

            current += character;
            continue;
        }

        if (character === '"' || character === "'") {
            quote = character;
            flush();
            continue;
        }

        if (character === "." || character === "[" || character === "]") {
            flush();
            continue;
        }

        current += character;
    }

    flush();

    return parts;
}

/**
 * Walks a path into a JSON value.
 *
 * An empty path returns the root, which is what makes "the whole body" a
 * selectable option rather than a special case in the UI.
 */
export function readJsonPath(source: JsonValue, path: string): JsonValue {
    let current: JsonValue = source;

    for (const key of splitJsonPath(path)) {
        if (Array.isArray(current)) {
            const index = Number(key);

            // A non-numeric key into an array is a miss, not `NaN` indexing.
            if (!Number.isInteger(index) || index < 0 || index >= current.length) {
                return null;
            }

            current = current[index];
            continue;
        }

        if (typeof current === "object" && current !== null) {
            if (!Object.hasOwn(current, key)) {
                return null;
            }

            current = current[key];
            continue;
        }

        // A scalar has nothing below it.
        return null;
    }

    return current;
}

/**
 * The same, over a flat string map — headers, cookies, query.
 *
 * Header names are matched case-insensitively because HTTP defines them that
 * way, and a reader who typed `Authorization` should not silently get nothing
 * because the runtime lower-cased it on the way in.
 */
export function readStringMap(
    source: Readonly<Record<string, string>>,
    key: string,
    caseInsensitive: boolean,
): JsonValue {
    const trimmed = key.trim();

    if (trimmed === "") {
        return null;
    }

    if (Object.hasOwn(source, trimmed)) {
        return source[trimmed];
    }

    if (!caseInsensitive) {
        return null;
    }

    const lowered = trimmed.toLowerCase();

    for (const [name, value] of Object.entries(source)) {
        if (name.toLowerCase() === lowered) {
            return value;
        }
    }

    return null;
}
