import { MAX_DIMENSION, MAX_DPI, MIN_DIMENSION, MIN_DPI } from "./constants";
import { LENGTH_UNITS, PHYSICAL_UNITS, type LengthUnit } from "../types";

/**
 * Turning what a form asked for into pixels.
 *
 * A passport office asks for millimetres, a print shop for inches, a website
 * for pixels, and only the last of those is a number a decoder understands.
 * Every conversion here goes through inches, because that is what DPI is
 * defined against — dots *per inch* — and doing millimetres directly means
 * carrying two constants that can disagree.
 */

/** Exact by definition since 1959, not a measurement. */
export const MM_PER_INCH = 25.4;

export const CM_PER_INCH = 2.54;

/** How many inches one unit is. Pixels are absent: they are the destination. */
const INCHES_PER_UNIT: Record<Exclude<LengthUnit, "px">, number> = {
    in: 1,
    cm: 1 / CM_PER_INCH,
    mm: 1 / MM_PER_INCH,
};

export function isPhysicalUnit(unit: LengthUnit): boolean {
    return PHYSICAL_UNITS.includes(unit);
}

export function isLengthUnit(value: string): value is LengthUnit {
    return (LENGTH_UNITS as readonly string[]).includes(value);
}

export function clampDpi(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_DPI;
    }

    return Math.min(MAX_DPI, Math.max(MIN_DPI, Math.round(value)));
}

/**
 * A length in some unit, as whole pixels.
 *
 * Rounded rather than truncated, and floored at one: 0.4 mm is a real thing to
 * type and a zero-pixel image is not a thing to produce. The result is also
 * capped, because the number a `<input type="number">` will hand over is
 * whatever somebody held a key down on.
 */
export function toPixels(value: number, unit: LengthUnit, dpi: number): number {
    if (!Number.isFinite(value) || value <= 0) {
        return MIN_DIMENSION;
    }

    const pixels = unit === "px" ? value : value * INCHES_PER_UNIT[unit] * clampDpi(dpi);

    return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(pixels)));
}

/**
 * The reverse, unrounded.
 *
 * Deliberately not rounded: this feeds a number input the reader is about to
 * see, and rounding 532 px at 300 DPI to `1.77 in` and then back gives 531. The
 * display layer decides how many decimals to show; the arithmetic keeps them.
 */
export function fromPixels(pixels: number, unit: LengthUnit, dpi: number): number {
    if (!Number.isFinite(pixels) || pixels <= 0) {
        return 0;
    }

    return unit === "px" ? pixels : pixels / (INCHES_PER_UNIT[unit] * clampDpi(dpi));
}

/**
 * How many decimals a unit is worth showing.
 *
 * Millimetres get one, inches get two, and pixels get none — an image is never
 * 1200.5 pixels wide, and offering the decimal invites somebody to type one.
 */
export function decimalsForUnit(unit: LengthUnit): number {
    switch (unit) {
        case "px":
            return 0;
        case "mm":
            return 1;
        case "cm":
        case "in":
            return 2;
    }
}

/** A physical length rounded to what its unit is worth, for display only. */
export function roundForUnit(value: number, unit: LengthUnit): number {
    const factor = 10 ** decimalsForUnit(unit);

    return Math.round(value * factor) / factor;
}
