import type { Hsva, Rgb, SwatchMatch } from "../types";
import { TAILWIND_EXACT_MATCH_DISTANCE } from "./constants";
import { hsvToRgb, oklchToRgb, rgbToOklab, type Oklab } from "./convert";
import { CSS_NAMED_COLORS } from "./css-colors";
import { formatHex } from "./format";
import { TAILWIND_FAMILIES, TAILWIND_SWATCHES, type TailwindSwatch } from "./tailwind-palette";

/**
 * Resolves the two built-in palettes to sRGB, and finds the swatch a colour is
 * nearest to in each.
 *
 * Distance is Euclidean in OKLab rather than in RGB: RGB distance calls a pair
 * of dark blues further apart than a pair of light greens that plainly differ,
 * which produces obviously wrong "closest" answers.
 */

export type ResolvedSwatch = {
    readonly name: string;
    readonly family: string;
    /** Numeric shade step, or an empty string where the palette has none. */
    readonly step: string;
    readonly rgb: Rgb;
    readonly hex: string;
    readonly oklab: Oklab;
};

const HEX_OPTIONS = { notation: "modern", hexCasing: "lower" } as const;

function resolveTailwind(swatch: TailwindSwatch): ResolvedSwatch {
    const rgb = oklchToRgb({ l: swatch.oklch[0], c: swatch.oklch[1], h: swatch.oklch[2] });

    return {
        name: swatch.name,
        family: swatch.family,
        step: swatch.step,
        rgb,
        hex: formatHex(rgb, HEX_OPTIONS),
        oklab: rgbToOklab(rgb),
    };
}

// Resolved once: both palettes are fixed data, and every screen needs the hexes.
const TAILWIND: readonly ResolvedSwatch[] = TAILWIND_SWATCHES.map(resolveTailwind);

const CSS_NAMED: readonly ResolvedSwatch[] = CSS_NAMED_COLORS.map((color) => {
    const rgb: Rgb = { r: color.rgb[0], g: color.rgb[1], b: color.rgb[2] };

    return {
        name: color.name,
        family: "css",
        step: "",
        rgb,
        hex: formatHex(rgb, HEX_OPTIONS),
        oklab: rgbToOklab(rgb),
    };
});

export function getTailwindSwatches(): readonly ResolvedSwatch[] {
    return TAILWIND;
}

export function getCssNamedSwatches(): readonly ResolvedSwatch[] {
    return CSS_NAMED;
}

export type SwatchFamily = {
    readonly family: string;
    readonly swatches: readonly ResolvedSwatch[];
};

export function getTailwindFamilies(): readonly SwatchFamily[] {
    return TAILWIND_FAMILIES.map((family) => ({
        family,
        swatches: TAILWIND.filter((swatch) => swatch.family === family),
    }));
}

function distance(a: Oklab, b: Oklab): number {
    return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

function findClosest(target: Oklab, swatches: readonly ResolvedSwatch[]): SwatchMatch {
    let closest = swatches[0];
    let smallest = Number.POSITIVE_INFINITY;

    for (const swatch of swatches) {
        const delta = distance(target, swatch.oklab);

        if (delta < smallest) {
            smallest = delta;
            closest = swatch;
        }
    }

    return {
        name: closest.name,
        rgb: closest.rgb,
        hex: closest.hex,
        distance: smallest,
        exact: smallest <= TAILWIND_EXACT_MATCH_DISTANCE,
    };
}

export function findClosestTailwindColor(hsva: Hsva): SwatchMatch {
    return findClosest(rgbToOklab(hsvToRgb(hsva)), TAILWIND);
}

export function findClosestCssColor(hsva: Hsva): SwatchMatch {
    return findClosest(rgbToOklab(hsvToRgb(hsva)), CSS_NAMED);
}
