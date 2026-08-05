import { pickCharacter } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";

import { SECRET_ALPHABET, SECRET_LENGTH } from "./constants";

/**
 * The two credentials a workspace answers to, and the one-way function both
 * are stored behind.
 *
 * The secret lives in an HttpOnly cookie and proves ownership on every studio
 * action. The recovery key is written down by a human and imports the workspace
 * somewhere else — it is drawn in `recovery-key.ts`, because its alphabet has
 * an entirely different job to do.
 *
 * Neither digest is salted or stretched, and that is deliberate rather than an
 * oversight: both inputs are uniform random values of 80 bits or more, which no
 * dictionary and no rainbow table reaches. The PBKDF2 in `short-links` exists
 * because a link password is human-chosen and therefore guessable; stretching a
 * 160-bit random string buys nothing and costs a round of key derivation on
 * every request the studio makes.
 */

/** About 165 bits. Never displayed, never typed, never leaves the cookie. */
export function createWorkspaceSecret(randomBytes: RandomBytes): string {
    let value = "";

    for (let index = 0; index < SECRET_LENGTH; index += 1) {
        value += pickCharacter(SECRET_ALPHABET, randomBytes);
    }

    return value;
}

const SECRET_PATTERN = new RegExp(`^[${SECRET_ALPHABET}]{${SECRET_LENGTH}}$`);

/**
 * Whether a cookie entry could name a workspace at all.
 *
 * The gate that runs before any query, so a hand-edited cookie costs a string
 * comparison rather than a database round trip per entry.
 */
export function isWorkspaceSecret(value: string): boolean {
    return SECRET_PATTERN.test(value);
}

/**
 * SHA-256, hex. Web Crypto rather than `node:crypto` so the same code runs in
 * the studio's server actions, in the public execution path, and in `bun test`
 * without a runtime check.
 */
export async function hashCredential(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
