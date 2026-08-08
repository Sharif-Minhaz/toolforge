import { MAX_PUBLIC_EXPONENT, MIN_PUBLIC_EXPONENT, PORTABLE_PUBLIC_EXPONENTS } from "./constants";

/**
 * Reads the public exponent field.
 *
 * Three rules, all from RFC 8017: it is an integer, it is at least 3, and it is
 * odd. The last one is not a convention — the exponent has to be coprime with
 * (p−1)(q−1), and both of those are even, so an even exponent has no inverse and
 * there is no private key to pair with it.
 *
 * Deliberately strict about the text as well as the number: a leading `+`, a
 * decimal point, an `0x` prefix or a space in the middle all mean the reader
 * typed something this field does not take, and `Number()` would quietly accept
 * most of them.
 */
export function parsePublicExponent(raw: string): number | null {
    const trimmed = raw.trim();

    if (!/^\d+$/.test(trimmed)) {
        return null;
    }

    const value = Number(trimmed);

    if (value < MIN_PUBLIC_EXPONENT || value > MAX_PUBLIC_EXPONENT || value % 2 === 0) {
        return null;
    }

    return value;
}

/**
 * The exponent as Web Crypto wants it: big-endian, with no leading zero byte.
 *
 * A leading zero is legal — every engine here reads `00 01 00 01` as 65537 — but
 * it changes the DER the key is exported under, because the exponent goes into
 * the structure as the byte string it was given. Trimming is what makes two
 * readers who typed the same number get the same bytes.
 */
export function exponentToBytes(value: number): Uint8Array<ArrayBuffer> {
    const bytes: number[] = [];
    let remaining = value;

    while (remaining > 0) {
        bytes.unshift(remaining % 256);
        remaining = Math.floor(remaining / 256);
    }

    return new Uint8Array(bytes);
}

/**
 * Whether every engine will mint a key for this exponent.
 *
 * Chrome and Firefox implement 3 and 65537 and reject the rest outright; Bun and
 * Node accept any odd integer. That disagreement is why a value outside this
 * pair is warned about before the press and named as `unsupported_exponent`
 * after it, rather than being filtered out of the field — a control whose
 * accepted values differ between the server pass and the browser is the
 * hydration bug this codebase keeps running into.
 */
export function isPortableExponent(value: number): boolean {
    return PORTABLE_PUBLIC_EXPONENTS.includes(value as (typeof PORTABLE_PUBLIC_EXPONENTS)[number]);
}
