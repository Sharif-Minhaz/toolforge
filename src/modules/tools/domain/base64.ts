/**
 * RFC 4648 base64 over raw bytes.
 *
 * Lifted out of the Base64 tool the moment a second caller needed it: a
 * `data:` URI is base64 too, and the Blur Placeholder generator has to inline
 * a PNG into one. Deliberately never `btoa`, which is limited to Latin-1 and
 * therefore cannot be handed arbitrary bytes without a string dance first.
 *
 * The alphabet is a parameter rather than a mode flag, so the tool that offers
 * the choice keeps owning the names it shows for it.
 */

export const STANDARD_BASE64_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Differs from the standard alphabet only in its last two symbols. */
export const URL_SAFE_BASE64_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const PAD = "=";

/** Symbol → sextet for both alphabets at once; the 62nd and 63rd slots differ
 *  between them and every other symbol is shared, so one map reads either. */
const SEXTETS = new Map<string, number>([
    ...[...STANDARD_BASE64_ALPHABET].map((symbol, value): [string, number] => [symbol, value]),
    ...[...URL_SAFE_BASE64_ALPHABET].map((symbol, value): [string, number] => [symbol, value]),
]);

export function bytesToBase64(
    bytes: Uint8Array,
    alphabet: string = STANDARD_BASE64_ALPHABET,
    padded = true,
): string {
    const parts: string[] = [];
    let index = 0;

    for (; index + 2 < bytes.length; index += 3) {
        const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];

        parts.push(
            alphabet[(chunk >>> 18) & 63] +
                alphabet[(chunk >>> 12) & 63] +
                alphabet[(chunk >>> 6) & 63] +
                alphabet[chunk & 63],
        );
    }

    const remaining = bytes.length - index;

    if (remaining === 1) {
        const chunk = bytes[index] << 16;

        parts.push(
            alphabet[(chunk >>> 18) & 63] +
                alphabet[(chunk >>> 12) & 63] +
                (padded ? `${PAD}${PAD}` : ""),
        );
    } else if (remaining === 2) {
        const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8);

        parts.push(
            alphabet[(chunk >>> 18) & 63] +
                alphabet[(chunk >>> 12) & 63] +
                alphabet[(chunk >>> 6) & 63] +
                (padded ? PAD : ""),
        );
    }

    return parts.join("");
}

/**
 * The inverse, for callers that need bytes back and nothing else.
 *
 * Deliberately thinner than the Base64 tool's own reader, which stays in that
 * module: it names its alphabets, tolerates what a person pastes, and reports
 * the position of the first character it could not use. Everything here is a
 * plumbing step in some other conversion, so a wrong string is one `null` and
 * the calling tool says what it means in its own vocabulary.
 *
 * Whitespace is stripped because a blob copied out of a log or a terminal
 * arrives wrapped, and both alphabets are accepted because neither `-_` nor
 * `+/` is ambiguous — no byte string can be read two ways.
 *
 * The buffer type is spelled out for the same reason it is on `hexToBytes`:
 * Web Crypto refuses a `Uint8Array` that might be backed by a
 * `SharedArrayBuffer`, and this one never is.
 */
export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> | null {
    const compact = text.replace(/\s+/g, "").replace(/=+$/, "");

    // Four symbols carry three bytes, so a remainder of one leaves six bits
    // that belong to no byte. There is no string that legitimately ends there.
    if (compact.length % 4 === 1) {
        return null;
    }

    const bytes = new Uint8Array(Math.floor((compact.length * 3) / 4));
    let accumulator = 0;
    let bits = 0;
    let written = 0;

    for (const character of compact) {
        const sextet = SEXTETS.get(character);

        if (sextet === undefined) {
            return null;
        }

        accumulator = (accumulator << 6) | sextet;
        bits += 6;

        if (bits >= 8) {
            bits -= 8;
            bytes[written] = (accumulator >>> bits) & 0xff;
            written += 1;
        }
    }

    return bytes;
}

/**
 * `data:image/png;base64,…` — always the standard alphabet with padding, which
 * is the only form RFC 2397 defines. The media type is not escaped because
 * every caller passes a literal from a codec table.
 */
export function bytesToDataUri(bytes: Uint8Array, mimeType: string): string {
    return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}
