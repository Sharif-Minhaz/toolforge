import { pickCharacter } from "./random";
import type { RandomBytes, ServerKeyResult } from "../types";

/**
 * The public name of a hosted server — the `<key>` in `/m/<key>/…` for a mock
 * server, and in `/j/<key>/…` for a JSON server.
 *
 * A DNS label's rules rather than a path segment's, deliberately: lower case,
 * digits and hyphens, no hyphen at either end, no doubled hyphen. Execution is
 * path-hosted today and will move to `<key>.mock.<site>` when a real domain
 * exists, and a key that is legal now and illegal then would strand every
 * server anybody had already made.
 *
 * One alphabet and one reserved list for both studios, not because their
 * keyspaces are shared — they are not, each has its own unique index under its
 * own path prefix — but because the phishing set below has to be the same
 * everywhere or it is only enforced in the place somebody remembered.
 */

/**
 * The public path segment naming a server. A DNS label's rules, so the same key
 * still works unchanged when execution moves to a subdomain.
 */
export const SERVER_KEY_LENGTH = { min: 3, max: 32 } as const;

export const SERVER_KEY_PATTERN = /^[a-z0-9-]+$/;

/**
 * Keys this service will not hand out.
 *
 * Two groups, and the second is the one that matters. The first is
 * infrastructure — anything that already names a path here, so a hosted server
 * can never shadow a real route if execution ever moves back onto this origin's
 * root. The second is the phishing set: a link reading `/m/secure-login/...`
 * borrows this site's name to look like somebody's sign-in page, which is the
 * same reservation list the URL Shortener keeps and for the same reason.
 *
 * Every entry has to be something `checkServerKey` would otherwise have
 * accepted — at least `SERVER_KEY_LENGTH.min` characters, inside
 * `SERVER_KEY_PATTERN`. A shorter one is protection nobody could have reached,
 * which reads as safety while providing none, and a test enforces exactly that.
 * `m` was here until it did: the prefix is a literal path segment in front of
 * the key, so nothing could ever have collided with it anyway — and `j` is
 * absent for the same reason.
 */
export const RESERVED_SERVER_KEYS: ReadonlySet<string> = new Set([
    "api",
    "app",
    "assets",
    "cdn",
    "docs",
    "help",
    "json",
    "mock",
    "mocks",
    "next",
    "public",
    "static",
    "status",
    "support",
    "tools",
    "unlock",
    "www",
    // Anything that reads as a lure.
    "account",
    "admin",
    "auth",
    "bank",
    "billing",
    "checkout",
    "confirm",
    "identity",
    "invoice",
    "login",
    "logon",
    "pay",
    "payment",
    "recover",
    "reset",
    "secure",
    "security",
    "signin",
    "signup",
    "update",
    "validate",
    "verify",
    "wallet",
]);

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
