/**
 * The 83-character alphabet BlurHash packs its coefficients into.
 *
 * Not base64, and not an arbitrary choice either: 83 is the largest radix whose
 * digits all survive being written inside a JSON string, an HTML attribute and
 * a URL query without escaping — which is the whole point of a hash you paste
 * into a database column and read out in a template.
 */
export const BASE83_ALPHABET =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";

export const BASE83_RADIX = BASE83_ALPHABET.length;

/**
 * Big-endian, fixed width, zero-padded on the left. `length` is always known by
 * the caller — one character for a flag, two for a coefficient, four for the
 * average colour — because the format has no separators to find a boundary by.
 */
export function encodeBase83(value: number, length: number): string {
    let result = "";

    for (let position = 1; position <= length; position += 1) {
        const digit = Math.floor(value / BASE83_RADIX ** (length - position)) % BASE83_RADIX;

        result += BASE83_ALPHABET[digit];
    }

    return result;
}

/** `null` rather than `NaN` for a character outside the alphabet. */
export function decodeBase83(characters: string): number | null {
    let value = 0;

    for (const character of characters) {
        const digit = BASE83_ALPHABET.indexOf(character);

        if (digit === -1) {
            return null;
        }

        value = value * BASE83_RADIX + digit;
    }

    return value;
}

/**
 * Index of the first character the alphabet does not contain, or `-1`.
 *
 * Counted with `for…of` over code points rather than by index, so an emoji
 * pasted into the middle of a hash reports the position a person would count to
 * rather than a UTF-16 offset.
 */
export function findInvalidBase83Index(characters: string): number {
    let index = 0;

    for (const character of characters) {
        if (!BASE83_ALPHABET.includes(character)) {
            return index;
        }

        index += 1;
    }

    return -1;
}
