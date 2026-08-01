import { pickCharacter } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";
import {
    DYNAMIC_EDIT_PREFIX,
    DYNAMIC_REDIRECT_PREFIX,
    EDIT_TOKEN_LENGTH,
    MAX_TARGET_URL_LENGTH,
    SLUG_ALPHABET,
    SLUG_LENGTH,
} from "./constants";

/**
 * Identifiers and URL handling for dynamic codes.
 *
 * Two values with very different jobs. The slug is public and printed, so it is
 * short and drawn from an alphabet with no look-alike glyphs — someone reads it
 * off a poster. The edit token is a credential: long, single-purpose, and shown
 * exactly once.
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

const SLUG_PATTERN = new RegExp(`^[${SLUG_ALPHABET}]{${SLUG_LENGTH}}$`);

const EDIT_TOKEN_PATTERN = new RegExp(`^[${SLUG_ALPHABET}]{${EDIT_TOKEN_LENGTH}}$`);

export function isValidSlug(value: string): boolean {
    return SLUG_PATTERN.test(value);
}

export function isValidEditToken(value: string): boolean {
    return EDIT_TOKEN_PATTERN.test(value);
}

/**
 * The token is stored only as a digest, so a leaked database backup does not
 * hand over the ability to re-point every printed code. No salt and no stretching:
 * the token is 190 bits of uniform randomness, which is not something a
 * dictionary reaches.
 */
export async function hashEditToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type TargetUrlFailureReason = "empty" | "too_long" | "not_a_url" | "unsupported_scheme";

export type TargetUrlResult =
    | { readonly ok: true; readonly url: string }
    | { readonly ok: false; readonly reason: TargetUrlFailureReason };

/**
 * Where a dynamic code is allowed to point.
 *
 * Only `http:` and `https:` — a short link is a redirect the visitor never sees
 * before it happens, so `javascript:` or `data:` behind one would be a hosted
 * attack rather than a convenience.
 */
export function parseTargetUrl(raw: string): TargetUrlResult {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (trimmed.length > MAX_TARGET_URL_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    // A bare host is what people paste, and prefixing it is what they meant.
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

    let url: URL;

    try {
        url = new URL(candidate);
    } catch {
        return { ok: false, reason: "not_a_url" };
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { ok: false, reason: "unsupported_scheme" };
    }

    if (url.hostname.length === 0) {
        return { ok: false, reason: "not_a_url" };
    }

    return { ok: true, url: url.toString() };
}

/**
 * Whether a target points back at this site's own redirect route. Following one
 * would either loop or, worse, let a chain of short links hide where a code
 * really goes.
 */
export function isSelfReferential(target: string, origin: string): boolean {
    try {
        const url = new URL(target);
        const site = new URL(origin);

        return (
            url.host === site.host &&
            (url.pathname === DYNAMIC_REDIRECT_PREFIX ||
                url.pathname.startsWith(`${DYNAMIC_REDIRECT_PREFIX}/`))
        );
    } catch {
        return false;
    }
}

export function buildShortUrl(slug: string, origin: string): string {
    return `${origin.replace(/\/$/, "")}${DYNAMIC_REDIRECT_PREFIX}/${slug}`;
}

export function buildEditUrl(token: string, origin: string): string {
    return `${origin.replace(/\/$/, "")}${DYNAMIC_EDIT_PREFIX}/${token}`;
}
