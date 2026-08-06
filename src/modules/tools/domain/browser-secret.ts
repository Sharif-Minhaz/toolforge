import { pickCharacter } from "./random";
import type { RandomBytes } from "../types";

/**
 * The session credential a browser holds for something it owns without an
 * account, and the one-way function it is stored behind.
 *
 * The secret lives in an HttpOnly cookie and proves ownership on every action.
 * The *other* credential — the printable one a human writes down and types in
 * somewhere else — is drawn in `recovery-key.ts`, because its alphabet has an
 * entirely different job to do.
 *
 * Neither digest is salted or stretched, and that is deliberate rather than an
 * oversight: both inputs are uniform random values of 80 bits or more, which no
 * dictionary and no rainbow table reaches. The PBKDF2 in `short-links` exists
 * because a link password is human-chosen and therefore guessable; stretching a
 * 160-bit random string buys nothing and costs a round of key derivation on
 * every request.
 *
 * Lifted out of the Mock Server Studio when the JSON Server Studio needed the
 * same credential. Each keeps its own cookie name and its own cap; what is
 * shared is the alphabet, the length and the digest.
 */

/** Never typed by a human — it only has to be unguessable and cookie-safe. */
export const SECRET_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** 32 characters of a 36-symbol alphabet: about 165 bits. */
export const SECRET_LENGTH = 32;

/** About 165 bits. Never displayed, never typed, never leaves the cookie. */
export function createBrowserSecret(randomBytes: RandomBytes): string {
    let value = "";

    for (let index = 0; index < SECRET_LENGTH; index += 1) {
        value += pickCharacter(SECRET_ALPHABET, randomBytes);
    }

    return value;
}

const SECRET_PATTERN = new RegExp(`^[${SECRET_ALPHABET}]{${SECRET_LENGTH}}$`);

/**
 * Whether a cookie entry could name anything at all.
 *
 * The gate that runs before any query, so a hand-edited cookie costs a string
 * comparison rather than a database round trip per entry.
 */
export function isBrowserSecret(value: string): boolean {
    return SECRET_PATTERN.test(value);
}

/**
 * SHA-256, hex. Web Crypto rather than `node:crypto` so the same code runs in
 * server actions, in a public execution path, and in `bun test` without a
 * runtime check.
 */
export async function hashCredential(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
