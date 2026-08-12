import type { AspectPreset, AspectRatio, CropRect } from "../types";
import type { PixelSize } from "@/modules/tools/types";

/**
 * Shapes, as the pair of numbers people say rather than as the quotient.
 *
 * `16:9` and `1.7777…` are the same constraint and not the same label, and the
 * label is what goes back into the box the reader typed it into. Everything
 * that constrains geometry takes the quotient; everything a person reads takes
 * the pair.
 */

export const FIXED_ASPECT_RATIOS: Partial<Record<AspectPreset, AspectRatio>> = {
    "1:1": { width: 1, height: 1 },
    "4:3": { width: 4, height: 3 },
    "3:2": { width: 3, height: 2 },
    "16:9": { width: 16, height: 9 },
    "3:4": { width: 3, height: 4 },
    "2:3": { width: 2, height: 3 },
    "9:16": { width: 9, height: 16 },
};

export function ratioValue(ratio: AspectRatio): number {
    return ratio.width / ratio.height;
}

function greatestCommonDivisor(a: number, b: number): number {
    return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/**
 * `1920 × 1080` as `16:9`.
 *
 * Only exact divisors are reduced. A 1000 × 667 photograph is *nearly* 3:2 and
 * is reported as `1000:667`, because a label that rounds is a label that lies —
 * and this one is offered to the reader as something to lock the crop to.
 */
export function reduceRatio(width: number, height: number): AspectRatio {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const divisor = greatestCommonDivisor(w, h);

    return { width: w / divisor, height: h / divisor };
}

/**
 * A ratio somebody typed.
 *
 * Three spellings, because all three turn up: `16:9`, `16/9`, and the bare
 * decimal `1.78` that a spreadsheet produced. Zero and negatives are refused
 * rather than clamped — there is no crop they could mean.
 */
export function parseAspectText(text: string): AspectRatio | null {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return null;
    }

    const pair = /^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i.exec(trimmed);

    if (pair !== null) {
        const width = Number(pair[1]);
        const height = Number(pair[2]);

        return width > 0 && height > 0 ? { width, height } : null;
    }

    const single = Number(trimmed);

    return Number.isFinite(single) && single > 0 ? { width: single, height: 1 } : null;
}

export function formatRatio(ratio: AspectRatio): string {
    const reduced =
        Number.isInteger(ratio.width) && Number.isInteger(ratio.height)
            ? reduceRatio(ratio.width, ratio.height)
            : ratio;

    return `${trimNumber(reduced.width)}:${trimNumber(reduced.height)}`;
}

function trimNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * The quotient a picker position means, or `null` for a free crop.
 *
 * `original` and `custom` are the two entries whose value is not in the table:
 * one comes from the picture, the other from what the reader typed. Both are
 * passed in rather than read here, because this file has no business knowing
 * about either.
 */
export function ratioForPreset(
    preset: AspectPreset,
    source: PixelSize,
    custom: AspectRatio | null,
): number | null {
    if (preset === "free") {
        return null;
    }

    if (preset === "original") {
        return source.height > 0 ? source.width / source.height : null;
    }

    if (preset === "custom") {
        return custom === null ? null : ratioValue(custom);
    }

    const fixed = FIXED_ASPECT_RATIOS[preset];

    return fixed === undefined ? null : ratioValue(fixed);
}

/** The shape a crop currently has, for the "original" entry and the readout. */
export function cropRatio(rect: CropRect): number {
    return rect.height > 0 ? rect.width / rect.height : 1;
}
