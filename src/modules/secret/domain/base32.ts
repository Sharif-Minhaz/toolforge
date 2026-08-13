/**
 * RFC 4648 §6 base32 over raw bytes.
 *
 * Deliberately not the Crockford alphabet in
 * `tools/domain/recovery-key.ts`, which drops `I`, `L`, `O` and `U` so a key
 * can be read off paper. That one is for humans; this one is for machines that
 * already agreed on a standard — a TOTP secret in an `otpauth://` URI is
 * RFC 4648 base32, and folding a character would produce a different shared
 * secret and a stream of codes that never verify.
 *
 * Local to this module until a second tool needs it. Encoding only: nothing
 * here reads base32 back, because nothing here is given base32 to read.
 */

/** `A–Z` then `2–7`. The digits `0`, `1` and `8` are absent by design. */
export const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const PAD = "=";

/** Five bytes become eight symbols, so the block is forty bits wide. */
const BITS_PER_SYMBOL = 5;
const SYMBOLS_PER_BLOCK = 8;

export function bytesToBase32(bytes: Uint8Array, padded = true): string {
    let output = "";
    let accumulator = 0;
    let bits = 0;

    for (const byte of bytes) {
        // Masked to the twelve bits that can still be live — four left over
        // from the previous symbol plus the eight just read. Without it the
        // accumulator grows until `<<` silently truncates it at 32 bits, which
        // happens to be harmless here and would stop being so the moment
        // anything below reads a wider slice.
        accumulator = ((accumulator << 8) | byte) & 0xfff;
        bits += 8;

        while (bits >= BITS_PER_SYMBOL) {
            bits -= BITS_PER_SYMBOL;
            output += BASE32_ALPHABET[(accumulator >>> bits) & 31];
        }
    }

    // A trailing partial group is left-aligned and zero-filled, which is what
    // makes the last symbol of an unpadded string decodable at all.
    if (bits > 0) {
        output += BASE32_ALPHABET[(accumulator << (BITS_PER_SYMBOL - bits)) & 31];
    }

    if (!padded) {
        return output;
    }

    const remainder = output.length % SYMBOLS_PER_BLOCK;

    return remainder === 0 ? output : output + PAD.repeat(SYMBOLS_PER_BLOCK - remainder);
}
