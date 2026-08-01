import { ALIAS_ALPHABET_PATTERN, ALIAS_LENGTH, RESERVED_ALIASES } from "./constants";

/**
 * Chosen slugs.
 *
 * An alias is the part of a short link a person reads out loud, so the rules
 * are about legibility before they are about storage: one canonical casing, no
 * runs of hyphens, nothing that could be mistaken for a route this site owns.
 */

export type AliasFailureReason = "too_short" | "too_long" | "invalid_characters" | "reserved";

export type AliasResult =
    | { readonly ok: true; readonly alias: string }
    | { readonly ok: false; readonly reason: AliasFailureReason };

/**
 * The one canonical form of what the reader typed.
 *
 * Casing is folded and inner whitespace becomes a hyphen, because someone who
 * types `Summer Sale` means `summer-sale` and would be baffled by a rejection.
 * The rest is left alone, so an alias with a `/` in it fails loudly rather than
 * being silently turned into something the reader did not ask for.
 */
export function normalizeAlias(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export function isReservedAlias(alias: string): boolean {
    return RESERVED_ALIASES.includes(alias);
}

export function parseAlias(raw: string): AliasResult {
    const alias = normalizeAlias(raw);

    if (alias.length < ALIAS_LENGTH.min) {
        return { ok: false, reason: "too_short" };
    }

    if (alias.length > ALIAS_LENGTH.max) {
        return { ok: false, reason: "too_long" };
    }

    // A leading or trailing hyphen, a doubled hyphen, or anything outside
    // `[a-z0-9-]`. Doubled hyphens are refused rather than collapsed: `a--b` and
    // `a-b` reading as one link would make two people's aliases collide.
    if (!ALIAS_ALPHABET_PATTERN.test(alias) || alias.includes("--")) {
        return { ok: false, reason: "invalid_characters" };
    }

    if (isReservedAlias(alias)) {
        return { ok: false, reason: "reserved" };
    }

    return { ok: true, alias };
}
