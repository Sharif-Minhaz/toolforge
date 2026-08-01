import type { QrErrorLevel, QrOptions } from "../types";
import { LOGO_ERROR_LEVEL, TRANSPARENT_BACKGROUND } from "./constants";

/**
 * The rules that tie the options together, as predicates rather than as a list
 * of pairs. Both the domain and the UI read them, so a control the workbench
 * disables is one the renderer would have overridden anyway.
 */

/**
 * A logo hides modules, and only the highest error-correction level carries
 * enough redundancy to reconstruct them. So the level is not the reader's to
 * choose while a logo is set — it is forced, and the picker says so.
 */
export function supportsLevelChoice(options: Pick<QrOptions, "logo">): boolean {
    return options.logo === null;
}

export function resolveErrorLevel(options: Pick<QrOptions, "logo" | "level">): QrErrorLevel {
    return supportsLevelChoice(options) ? options.level : LOGO_ERROR_LEVEL;
}

/**
 * What a logo sits on when the code itself is transparent. The logo needs an
 * opaque patch or the modules behind it show through and neither reads; white
 * is the only choice that works over an unknown background.
 *
 * This is a raw colour literal on purpose: it paints the reader's own artwork,
 * not a themed surface, so no design token applies to it.
 */
export function resolveLogoBacking(options: Pick<QrOptions, "background">): string {
    return options.background === TRANSPARENT_BACKGROUND ? "#ffffff" : options.background;
}

/**
 * Whether the two chosen colours are far enough apart for a scanner. Contrast
 * is measured the way WCAG measures it, which is a proxy — a camera cares about
 * luminance difference, and relative luminance is the closest cheap stand-in.
 *
 * `transparent` is unknowable, so it is never reported as a problem.
 */
export function hasScannableContrast(options: Pick<QrOptions, "foreground" | "background">) {
    if (options.background === TRANSPARENT_BACKGROUND) {
        return true;
    }

    const foreground = relativeLuminance(options.foreground);
    const background = relativeLuminance(options.background);

    if (foreground === null || background === null) {
        return true;
    }

    const lighter = Math.max(foreground, background);
    const darker = Math.min(foreground, background);

    return (lighter + 0.05) / (darker + 0.05) >= MIN_SCAN_CONTRAST;
}

/**
 * Below this, a phone camera starts failing in ordinary light. Well above the
 * 4.5:1 that text needs, because a scanner has no context to fall back on.
 */
export const MIN_SCAN_CONTRAST = 7;

function relativeLuminance(hex: string): number | null {
    const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());

    if (match === null) {
        return null;
    }

    const value = Number.parseInt(match[1], 16);
    const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => {
        const ratio = channel / 255;

        return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
