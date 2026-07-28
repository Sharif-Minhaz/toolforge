import {
    COLOR_SCALE_STEPS,
    type ColorScaleStep,
    type ColorScaleStop,
    type ColorFormatOptions,
    type Hsva,
    type Oklch,
} from "../types";
import { SCALE_REFERENCE_FAMILY } from "./constants";
import { clampChromaToGamut, hsvToRgb, oklchToRgb, rgbToOklch } from "./convert";
import { formatHex } from "./format";
import { TAILWIND_SWATCHES } from "./tailwind-palette";

/**
 * Builds a Tailwind-shaped 50→950 ladder from one colour.
 *
 * The ladder's proportions are read out of the generated palette rather than
 * invented: each stop borrows a reference family's lightness outright and
 * scales the picked colour's chroma by that stop's share of the family's 500.
 * Steps are walked in OKLCH so the mid tones stay evenly spaced — an HSL
 * lightness ramp bunches them and washes the ends out.
 */

type Reference = {
    readonly lightness: number;
    /** This stop's chroma as a fraction of the family's 500 chroma. */
    readonly chromaRatio: number;
};

function buildReference(): ReadonlyMap<ColorScaleStep, Reference> {
    const family = TAILWIND_SWATCHES.filter((swatch) => swatch.family === SCALE_REFERENCE_FAMILY);
    const anchor = family.find((swatch) => swatch.step === "500");

    if (anchor === undefined) {
        throw new Error(`palette is missing ${SCALE_REFERENCE_FAMILY}-500`);
    }

    return new Map(
        COLOR_SCALE_STEPS.map((step) => {
            const swatch = family.find((entry) => entry.step === step);

            if (swatch === undefined) {
                throw new Error(`palette is missing ${SCALE_REFERENCE_FAMILY}-${step}`);
            }

            return [
                step,
                { lightness: swatch.oklch[0], chromaRatio: swatch.oklch[1] / anchor.oklch[1] },
            ];
        }),
    );
}

const REFERENCE = buildReference();

/** The stop whose lightness sits closest to the colour the user picked. */
function nearestStep(lightness: number): ColorScaleStep {
    let closest: ColorScaleStep = COLOR_SCALE_STEPS[0];
    let smallest = Number.POSITIVE_INFINITY;

    for (const step of COLOR_SCALE_STEPS) {
        const distance = Math.abs((REFERENCE.get(step)?.lightness ?? 0) - lightness);

        if (distance < smallest) {
            smallest = distance;
            closest = step;
        }
    }

    return closest;
}

export function buildColorScale(
    hsva: Hsva,
    options: ColorFormatOptions,
): readonly ColorScaleStop[] {
    const base = rgbToOklch(hsvToRgb(hsva));
    const baseStep = nearestStep(base.l);

    return COLOR_SCALE_STEPS.map((step) => {
        const reference = REFERENCE.get(step);
        const target: Oklch = {
            l: reference?.lightness ?? base.l,
            // Pulling chroma back at the ends is what stops a light tint from
            // reading as a different, muddier hue.
            c: base.c * (reference?.chromaRatio ?? 1),
            h: base.h,
        };
        const rgb = oklchToRgb(clampChromaToGamut(target));

        return {
            step,
            rgb,
            hex: formatHex(rgb, options),
            isBase: step === baseStep,
        };
    });
}
