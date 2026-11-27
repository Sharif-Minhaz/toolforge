/**
 * Exact arithmetic for money, as fractions of two `bigint`s.
 *
 * A zakat figure is a sum of a dozen amounts, a weight times a price per gram
 * that is itself a price per troy ounce over 31.1034768, a currency
 * conversion, and 2.5% of the lot. In binary floating point each of those
 * steps is a rounding, and `0.1 + 0.2` is not `0.3`; on a large estate the
 * drift reaches the paisa and the threshold check can land on the wrong side
 * of nisab. Fractions do not drift: every step here is exact, and the one
 * rounding happens at the very end, in the direction the caller names.
 *
 * Always normalised — the denominator positive, the fraction in lowest terms —
 * so two equal values are always structurally equal.
 */

export type Exact = { readonly n: bigint; readonly d: bigint };

function gcd(a: bigint, b: bigint): bigint {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;

    while (y !== 0n) {
        [x, y] = [y, x % y];
    }

    return x;
}

function make(n: bigint, d: bigint): Exact {
    if (d === 0n) {
        // Programmer error: no caller divides by a value it has not checked.
        throw new RangeError("Exact: division by zero");
    }

    const sign = d < 0n ? -1n : 1n;
    const divisor = gcd(n, d) || 1n;

    return { n: (sign * n) / divisor, d: (sign * d) / divisor };
}

export const ZERO: Exact = { n: 0n, d: 1n };

export function int(value: number | bigint): Exact {
    return make(BigInt(value), 1n);
}

export function ratio(n: number | bigint, d: number | bigint): Exact {
    return make(BigInt(n), BigInt(d));
}

/**
 * A plain decimal string — `1234.5`, `-0.075`, `85` — exactly. Anything else,
 * exponent notation included, is `null`: a number that reached here as `1e21`
 * has already been through a float.
 */
const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

export function parseExact(text: string): Exact | null {
    const match = DECIMAL.exec(text.trim());

    if (match === null) {
        return null;
    }

    const [, minus, whole, fraction = ""] = match;
    const n = BigInt(`${whole}${fraction}`) * (minus === "-" ? -1n : 1n);

    return make(n, 10n ** BigInt(fraction.length));
}

/**
 * A float from a price feed, taken at its shortest round-trip spelling.
 * `3627.899902` stays `3627.899902`; the float's binary noise below that is
 * not invented into the fraction.
 */
export function fromNumber(value: number): Exact | null {
    if (!Number.isFinite(value)) {
        return null;
    }

    const text = String(value);

    if (!text.includes("e")) {
        return parseExact(text);
    }

    // Very large or very small: let toFixed spell it out to 20 places.
    return parseExact(value.toFixed(20));
}

export function add(a: Exact, b: Exact): Exact {
    return make(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Exact, b: Exact): Exact {
    return make(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Exact, b: Exact): Exact {
    return make(a.n * b.n, a.d * b.d);
}

export function div(a: Exact, b: Exact): Exact {
    return make(a.n * b.d, a.d * b.n);
}

export function sum(values: readonly Exact[]): Exact {
    return values.reduce(add, ZERO);
}

export function compare(a: Exact, b: Exact): -1 | 0 | 1 {
    const left = a.n * b.d;
    const right = b.n * a.d;

    return left < right ? -1 : left > right ? 1 : 0;
}

export function isZero(a: Exact): boolean {
    return a.n === 0n;
}

export function isNegative(a: Exact): boolean {
    return a.n < 0n;
}

export function max(a: Exact, b: Exact): Exact {
    return compare(a, b) >= 0 ? a : b;
}

export function min(a: Exact, b: Exact): Exact {
    return compare(a, b) <= 0 ? a : b;
}

export type Rounding = "up" | "down" | "half-up";

/**
 * Rounds to `digits` decimal places and spells the result as a plain decimal
 * string. `up` and `down` are away from and towards zero: zakat payable is
 * rounded up, so nobody underpays by a fraction of a paisa; a threshold shown
 * for comparison is rounded half-up.
 */
export function toDecimal(a: Exact, digits: number, rounding: Rounding = "half-up"): string {
    const scale = 10n ** BigInt(digits);
    const negative = a.n < 0n;
    const magnitude = negative ? -a.n : a.n;
    const scaled = magnitude * scale;
    let quotient = scaled / a.d;
    const remainder = scaled % a.d;

    if (remainder !== 0n) {
        if (rounding === "up") {
            quotient += 1n;
        } else if (rounding === "half-up" && remainder * 2n >= a.d) {
            quotient += 1n;
        }
    }

    const text = quotient.toString().padStart(digits + 1, "0");
    const whole = digits === 0 ? text : text.slice(0, -digits);
    const fraction = digits === 0 ? "" : `.${text.slice(-digits)}`;
    const sign = negative && quotient !== 0n ? "-" : "";

    return `${sign}${whole}${fraction}`;
}

/**
 * A value that came from a decimal, spelled back without padding: `125.02`,
 * not `125.0200000000`. Twenty places is past any feed's precision.
 */
export function toPlainDecimal(a: Exact): string {
    const text = toDecimal(a, 20);

    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/** The nearest float, for display through `Intl.NumberFormat` only — never for arithmetic. */
export function toNumber(a: Exact, digits = 6): number {
    return Number(toDecimal(a, digits));
}
