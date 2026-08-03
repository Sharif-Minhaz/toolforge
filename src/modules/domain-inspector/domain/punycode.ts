/**
 * RFC 3492 Punycode decoding, so an internationalised name can be shown the way
 * its owner writes it rather than as `xn--`.
 *
 * Only the decoder is here. Encoding is already done for us: the WHATWG `URL`
 * parser applies IDNA ToASCII, and it is specified rather than host-derived, so
 * it gives the same answer in Bun, Node and every browser. `node:punycode` is
 * deprecated and unavailable in a browser bundle, which is why this is
 * hand-rolled rather than imported.
 */

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = "-";

export const PUNYCODE_PREFIX = "xn--";

/** Bounds the decoder's arithmetic; RFC 3492 uses the same 32-bit ceiling. */
const MAX_INT = 0x7fffffff;

/** `a`–`z` and `A`–`Z` are 0–25, `0`–`9` are 26–35. Anything else is invalid. */
function decodeDigit(code: number): number {
    if (code >= 0x30 && code <= 0x39) {
        return code - 0x30 + 26;
    }

    if (code >= 0x41 && code <= 0x5a) {
        return code - 0x41;
    }

    if (code >= 0x61 && code <= 0x7a) {
        return code - 0x61;
    }

    return BASE;
}

/** RFC 3492 §6.1 bias adaptation, transcribed rather than re-derived. */
function adapt(delta: number, numPoints: number, firstTime: boolean): number {
    let scaled = firstTime ? Math.floor(delta / DAMP) : delta >> 1;

    scaled += Math.floor(scaled / numPoints);

    let k = 0;

    while (scaled > ((BASE - TMIN) * TMAX) >> 1) {
        scaled = Math.floor(scaled / (BASE - TMIN));
        k += BASE;
    }

    return k + Math.floor(((BASE - TMIN + 1) * scaled) / (scaled + SKEW));
}

/**
 * Decodes one label's payload — the part after `xn--`. Returns `null` for
 * anything that is not valid Punycode, because a hostname is worth showing even
 * when one label of it is nonsense.
 */
export function decodePunycode(encoded: string): string | null {
    const output: number[] = [];
    const lastDelimiter = encoded.lastIndexOf(DELIMITER);

    let index = 0;

    if (lastDelimiter > 0) {
        for (let position = 0; position < lastDelimiter; position += 1) {
            const code = encoded.charCodeAt(position);

            if (code >= 0x80) {
                return null;
            }

            output.push(code);
        }

        index = lastDelimiter + 1;
    }

    let n = INITIAL_N;
    let i = 0;
    let bias = INITIAL_BIAS;

    while (index < encoded.length) {
        const oldI = i;

        let w = 1;

        for (let k = BASE; ; k += BASE) {
            if (index >= encoded.length) {
                return null;
            }

            const digit = decodeDigit(encoded.charCodeAt(index));

            index += 1;

            if (digit >= BASE || digit > Math.floor((MAX_INT - i) / w)) {
                return null;
            }

            i += digit * w;

            const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;

            if (digit < t) {
                break;
            }

            const baseMinusT = BASE - t;

            if (w > Math.floor(MAX_INT / baseMinusT)) {
                return null;
            }

            w *= baseMinusT;
        }

        const out = output.length + 1;

        bias = adapt(i - oldI, out, oldI === 0);

        if (Math.floor(i / out) > MAX_INT - n) {
            return null;
        }

        n += Math.floor(i / out);
        i %= out;

        // Beyond the Unicode range is not a code point, however well-formed the
        // arithmetic that produced it.
        if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) {
            return null;
        }

        output.splice(i, 0, n);
        i += 1;
    }

    return String.fromCodePoint(...output);
}

/**
 * Rewrites every `xn--` label of an ASCII hostname back to Unicode. A label
 * that will not decode is left exactly as it was, so the result is always a
 * hostname and never a partial one.
 */
export function toUnicodeHostname(hostname: string): string {
    if (!hostname.toLowerCase().includes(PUNYCODE_PREFIX)) {
        return hostname;
    }

    return hostname
        .split(".")
        .map((label) => {
            if (!label.toLowerCase().startsWith(PUNYCODE_PREFIX)) {
                return label;
            }

            return decodePunycode(label.slice(PUNYCODE_PREFIX.length)) ?? label;
        })
        .join(".");
}
