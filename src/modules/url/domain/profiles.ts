import { URL_ENCODE_PROFILES, type UrlEncodeProfile } from "../types";

/**
 * Which bytes each profile writes through untouched.
 *
 * Everything is decided per byte rather than per character, because a character
 * set turns text into bytes first and percent-encoding only ever sees the
 * result. `%` is absent from every set on purpose: it introduces an escape, so
 * leaving it raw would make the output impossible to read back.
 */

/** RFC 3986 §2.3 — unreserved, and never encoded by any profile. */
const UNRESERVED_SYMBOLS = "-._~";

/** RFC 3986 §2.2 — the gen-delims and sub-delims that give a URL its shape. */
const RESERVED_SYMBOLS = ":/?#[]@!$&'()*+,;=";

/** The WHATWG urlencoded serialiser keeps only these beyond alphanumerics. */
const FORM_SYMBOLS = "*-._";

const PROFILE_SYMBOLS: Record<UrlEncodeProfile, string> = {
    component: UNRESERVED_SYMBOLS,
    uri: UNRESERVED_SYMBOLS + RESERVED_SYMBOLS,
    form: FORM_SYMBOLS,
};

const DIGIT_START = 0x30;
const DIGIT_END = 0x39;
const UPPER_START = 0x41;
const UPPER_END = 0x5a;
const LOWER_START = 0x61;
const LOWER_END = 0x7a;

/** Alphanumerics are safe under every profile, so they are tested arithmetically. */
function isAlphanumeric(byte: number): boolean {
    return (
        (byte >= DIGIT_START && byte <= DIGIT_END) ||
        (byte >= UPPER_START && byte <= UPPER_END) ||
        (byte >= LOWER_START && byte <= LOWER_END)
    );
}

function buildKeepTable(profile: UrlEncodeProfile): Uint8Array {
    const table = new Uint8Array(256);

    for (let byte = 0; byte < table.length; byte += 1) {
        table[byte] = isAlphanumeric(byte) ? 1 : 0;
    }

    for (const symbol of PROFILE_SYMBOLS[profile]) {
        table[symbol.charCodeAt(0)] = 1;
    }

    return table;
}

const KEEP_TABLES: Record<UrlEncodeProfile, Uint8Array> = Object.fromEntries(
    URL_ENCODE_PROFILES.map((profile) => [profile, buildKeepTable(profile)]),
) as Record<UrlEncodeProfile, Uint8Array>;

export function keepsByteRaw(profile: UrlEncodeProfile, byte: number): boolean {
    return KEEP_TABLES[profile][byte] === 1;
}

/**
 * Whether a single ASCII character survives this profile untouched. Used by the
 * reference table in the article, so the documentation cannot drift from the
 * encoder it describes.
 */
export function keepsCharacterRaw(profile: UrlEncodeProfile, character: string): boolean {
    const byte = character.charCodeAt(0);

    return byte < 128 && keepsByteRaw(profile, byte);
}
