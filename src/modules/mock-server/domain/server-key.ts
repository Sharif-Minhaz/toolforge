import { pickCharacter } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";

import { RESERVED_SERVER_KEYS, SERVER_KEY_LENGTH, SERVER_KEY_PATTERN } from "./constants";
import type { ServerKeyResult } from "../types/routing";

/**
 * The public name of a mock server — the `<key>` in `/m/<key>/…`.
 *
 * A DNS label's rules rather than a path segment's, deliberately: lower case,
 * digits and hyphens, no hyphen at either end, no doubled hyphen. Execution is
 * path-hosted today and will move to `<key>.mock.<site>` when a real domain
 * exists, and a key that is legal now and illegal then would strand every
 * server anybody had already made.
 */

/** Never `l`, `1`, `0` or `o` — a key gets read aloud and typed back in. */
const DRAW_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

const DRAWN_KEY_LENGTH = 8;

export function checkServerKey(input: string): ServerKeyResult {
    const key = input.trim().toLowerCase();

    if (key === "") {
        return { ok: false, reason: "empty_key" };
    }

    if (key.length < SERVER_KEY_LENGTH.min) {
        return { ok: false, reason: "too_short" };
    }

    if (key.length > SERVER_KEY_LENGTH.max) {
        return { ok: false, reason: "too_long" };
    }

    if (!SERVER_KEY_PATTERN.test(key)) {
        return { ok: false, reason: "invalid_characters" };
    }

    if (key.startsWith("-") || key.endsWith("-")) {
        return { ok: false, reason: "edge_hyphen" };
    }

    // `xn--` is the punycode prefix, so a doubled hyphen in the third and
    // fourth positions makes a label a resolver may read as an encoded name.
    // Refusing every doubled hyphen is the simpler rule and costs nothing.
    if (key.includes("--")) {
        return { ok: false, reason: "double_hyphen" };
    }

    if (RESERVED_SERVER_KEYS.has(key)) {
        return { ok: false, reason: "reserved" };
    }

    return { ok: true, key };
}

/**
 * A key for somebody who did not choose one. Roughly 40 bits, which is not a
 * security property — collisions are handled by a retry on the unique index —
 * but is enough that two people naming nothing rarely collide at all.
 */
export function createServerKey(randomBytes: RandomBytes): string {
    let key = "";

    for (let index = 0; index < DRAWN_KEY_LENGTH; index += 1) {
        key += pickCharacter(DRAW_ALPHABET, randomBytes);
    }

    return key;
}

/**
 * Turns a server's display name into a key candidate.
 *
 * Best-effort and always checked afterwards: it can produce something reserved,
 * too short, or empty, and `checkServerKey` is what decides. Suggesting rather
 * than enforcing is the point — the reader can always type their own.
 */
export function suggestServerKey(name: string): string {
    return (
        name
            .toLowerCase()
            .normalize("NFKD")
            // Anything outside the alphabet becomes a separator rather than being
            // dropped, so "Payments API" is `payments-api` and not `paymentsapi`.
            .replace(/[^a-z0-9]+/gu, "-")
            .replace(/-+/gu, "-")
            .replace(/^-|-$/gu, "")
            .slice(0, SERVER_KEY_LENGTH.max)
            .replace(/-$/u, "")
    );
}
