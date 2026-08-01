import { pickCharacter } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";
import {
    ALIAS_LENGTH,
    EDIT_TOKEN_LENGTH,
    SLUG_ALPHABET,
    SLUG_LENGTH,
    ALIAS_ALPHABET_PATTERN,
} from "./constants";

/**
 * The two identifiers a short link carries, with very different jobs.
 *
 * The slug is public and often printed, so it is short and drawn from an
 * alphabet with no look-alike glyphs — someone reads it off a poster. The edit
 * token is a credential: long, single-purpose, and shown exactly once.
 */

function draw(length: number, randomBytes: RandomBytes): string {
    let value = "";

    for (let index = 0; index < length; index += 1) {
        value += pickCharacter(SLUG_ALPHABET, randomBytes);
    }

    return value;
}

/** Roughly 38 bits. Collisions are handled by a retry, not by the length. */
export function createSlug(randomBytes: RandomBytes): string {
    return draw(SLUG_LENGTH, randomBytes);
}

/** Roughly 190 bits — a value nobody guesses and nobody brute-forces. */
export function createEditToken(randomBytes: RandomBytes): string {
    return draw(EDIT_TOKEN_LENGTH, randomBytes);
}

const DRAWN_SLUG_PATTERN = new RegExp(`^[${SLUG_ALPHABET}]{${SLUG_LENGTH}}$`);

const EDIT_TOKEN_PATTERN = new RegExp(`^[${SLUG_ALPHABET}]{${EDIT_TOKEN_LENGTH}}$`);

/** True only for a slug this service drew itself. */
export function isDrawnSlug(value: string): boolean {
    return DRAWN_SLUG_PATTERN.test(value);
}

/**
 * Whether a path segment could name a row at all — the gate a redirect runs
 * before it queries anything.
 *
 * Deliberately the alias rule rather than the drawn-slug rule: chosen aliases
 * and drawn slugs share one keyspace, so one predicate has to admit both. Every
 * drawn slug satisfies it, being eight lowercase alphanumerics.
 */
export function isResolvableSlug(value: string): boolean {
    return (
        value.length >= ALIAS_LENGTH.min &&
        value.length <= ALIAS_LENGTH.max &&
        ALIAS_ALPHABET_PATTERN.test(value) &&
        !value.includes("--")
    );
}

export function isValidEditToken(value: string): boolean {
    return EDIT_TOKEN_PATTERN.test(value);
}

/**
 * The token is stored only as a digest, so a leaked database backup does not
 * hand over the ability to re-point every link. No salt and no stretching: the
 * token is 190 bits of uniform randomness, which is not something a dictionary
 * reaches.
 */
export async function hashEditToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
