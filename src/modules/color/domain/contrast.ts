import type { ContrastCheck, ContrastLevel, ContrastReport, Hsva, Rgb } from "../types";
import { clamp, hsvToRgb } from "./convert";

/**
 * WCAG 2.1 contrast, using the coefficients and the 0.04045 transfer threshold
 * the specification publishes — the same numbers `axe-core` evaluates a real
 * page with.
 */

export const CONTRAST_AA = 4.5;
export const CONTRAST_AA_LARGE = 3;
export const CONTRAST_AAA = 7;
/** Success Criterion 1.4.11: icons, borders, and focus rings need 3:1. */
export const CONTRAST_UI = 3;

export const BLACK: Rgb = { r: 0, g: 0, b: 0 };
export const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function toLinear(channel: number): number {
    const value = clamp(channel, 0, 255) / 255;

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
    return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

/** Between 1 (identical) and 21 (black on white). Order does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);

    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function levelFor(ratio: number): ContrastLevel {
    if (ratio >= CONTRAST_AAA) {
        return "aaa";
    }

    if (ratio >= CONTRAST_AA) {
        return "aa";
    }

    return ratio >= CONTRAST_AA_LARGE ? "aaLarge" : "fail";
}

export function checkContrast(foreground: Rgb, background: Rgb): ContrastCheck {
    const ratio = contrastRatio(foreground, background);

    // The verdict is taken from the exact ratio and only then rounded for
    // display: 4.497 is a failure that must not be shown as a passing 4.50.
    return {
        ratio: Math.round(ratio * 100) / 100,
        level: levelFor(ratio),
        passesUi: ratio >= CONTRAST_UI,
    };
}

/**
 * How the colour fares against the two text colours every design starts from.
 * Alpha is ignored — a translucent colour's contrast depends on whatever sits
 * behind it, which the tool cannot know.
 */
export function getContrastReport(hsva: Hsva): ContrastReport {
    const rgb = hsvToRgb(hsva);
    const onBlack = checkContrast(BLACK, rgb);
    const onWhite = checkContrast(WHITE, rgb);

    return {
        onBlack,
        onWhite,
        bestTextOn: onBlack.ratio >= onWhite.ratio ? "black" : "white",
    };
}
