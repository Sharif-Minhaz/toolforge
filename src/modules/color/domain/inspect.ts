import type {
    ColorFormatOptions,
    ColorScaleStop,
    ContrastReport,
    FormattedColor,
    Hsva,
    Rgb,
    SwatchMatch,
} from "../types";
import { getContrastReport } from "./contrast";
import { hsvToRgb } from "./convert";
import { formatAll, toCssColor } from "./format";
import { findClosestCssColor, findClosestTailwindColor } from "./matching";
import { buildColorScale } from "./scale";

export type ColorInspection = {
    readonly color: Hsva;
    readonly rgb: Rgb;
    readonly formats: readonly FormattedColor[];
    /** Ready to hand to a `style` attribute, alpha included. */
    readonly css: string;
    readonly contrast: ContrastReport;
    readonly scale: readonly ColorScaleStop[];
    readonly tailwind: SwatchMatch;
    readonly cssName: SwatchMatch;
};

/**
 * The one derivation the whole tool runs, shared by the server-rendered first
 * paint and every settled edit afterwards. Pure and deterministic, so
 * hydration has nothing to reconcile.
 */
export function inspectColor(color: Hsva, options: ColorFormatOptions): ColorInspection {
    return {
        color,
        rgb: hsvToRgb(color),
        formats: formatAll(color, options),
        css: toCssColor(color),
        contrast: getContrastReport(color),
        scale: buildColorScale(color, options),
        tailwind: findClosestTailwindColor(color),
        cssName: findClosestCssColor(color),
    };
}
