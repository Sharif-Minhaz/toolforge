/**
 * Writing a very large number so a reader can hold it.
 *
 * `Intl.NumberFormat` gives two shapes and both fail past a point. Compact
 * notation runs out of names after "T", so 4.1 × 10²⁰ renders as "410,000,000T"
 * in English and as an equally unreadable string of lakh-crores in Bangla.
 * Scientific notation renders it as "4.1E20", which is exact and tells a
 * non-specialist nothing — it is the notation, not the figure, that is the
 * problem: the number is 410 quintillion, and that is the sentence to print.
 *
 * So this module classifies a magnitude and lets the UI name it:
 *
 * - under a million, a grouping separator is enough — "53,000" over "53 thousand";
 * - up to a decillion, a short-scale name carries it — "410 quintillion";
 * - above that the names inform nobody, so it falls back to 10ⁿ.
 *
 * Rounding is `toExponential`'s, deliberately: it rounds to two significant
 * figures *and* carries, so 9.96 × 10²⁰ arrives as 1.0 × 10²¹ and a mantissa can
 * never round up out of the name it was given. Anything printing "1,000
 * quintillion" has done this by hand and got it wrong.
 */

/** Short-scale names, in ascending powers of a thousand starting at 10⁶. */
export const MAGNITUDE_SCALES = [
    "million",
    "billion",
    "trillion",
    "quadrillion",
    "quintillion",
    "sextillion",
    "septillion",
    "octillion",
    "nonillion",
    "decillion",
] as const;

export type MagnitudeScale = (typeof MAGNITUDE_SCALES)[number];

/**
 * A number split into something a sentence can say. `value` is always what the
 * reader sees; the UI formats it through `Intl` so Bangla gets Bengali digits.
 */
export type Magnitude =
    /** Small enough to print as itself. */
    | { readonly kind: "plain"; readonly value: number }
    /** `value` × the scale, so 4.1 × 10²⁰ is `{ value: 410, scale: "quintillion" }`. */
    | { readonly kind: "scaled"; readonly value: number; readonly scale: MagnitudeScale }
    /** Past every name worth using: `value` × 10^`exponent`. */
    | { readonly kind: "power"; readonly value: number; readonly exponent: number };

/** Each name is a thousand times the one before it. */
const SCALE_STEP = 3;

/**
 * Where the names start, counted in those steps: 2 is a million. A thousand is
 * deliberately left out — "1,200 years" is plainer than "1.2 thousand years",
 * and every locale already has a grouping separator for that range.
 */
const FIRST_NAMED_STEP = 2;

const SMALLEST_NAMED = 10 ** (FIRST_NAMED_STEP * SCALE_STEP);

export function describeMagnitude(value: number): Magnitude {
    if (!Number.isFinite(value) || Math.abs(value) < SMALLEST_NAMED) {
        return { kind: "plain", value };
    }

    const [mantissaText, exponentText] = value.toExponential(1).split("e");
    const mantissa = Number(mantissaText);
    const exponent = Number(exponentText);
    const step = Math.floor(exponent / SCALE_STEP);
    const scale = MAGNITUDE_SCALES[step - FIRST_NAMED_STEP];

    if (scale === undefined) {
        return { kind: "power", value: mantissa, exponent };
    }

    return {
        kind: "scaled",
        // The mantissa carries the remainder of the exponent, so 4.1 × 10²⁰ is
        // 410 quintillion rather than 4.1. `toFixed` because binary floating
        // point hands back 410.00000000000006 for that multiplication.
        value: Number((mantissa * 10 ** (exponent - step * SCALE_STEP)).toFixed(1)),
        scale,
    };
}

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/**
 * Digits as their superscript glyphs, for an exponent that has to live inside a
 * translated string. Unicode has no Bengali superscripts, so these stay Latin in
 * both locales — which is what the Bangla copy already does for "10¹¹".
 */
export function superscript(value: number): string {
    return [...String(value)]
        .map((character) => (character === "-" ? "⁻" : SUPERSCRIPT_DIGITS[Number(character)]))
        .join("");
}
