import type { WebManifestExtras } from "@/modules/tools/domain/favicon";
import type { FaviconFailureReason, FaviconOptions } from "../types";
import { HEX_COLOR_PATTERN } from "./constants";

/**
 * True when the text holds something a font can draw. Whitespace, control
 * characters and default-ignorables (ZWJ, variation selectors, the soft hyphen)
 * have no ink, so a text made only of them would fit an empty box — refused as
 * `empty_text` rather than drawn as a blank plate.
 */
export function hasVisibleText(text: string): boolean {
    return /[^\p{White_Space}\p{Cc}\p{Default_Ignorable_Code_Point}]/u.test(text);
}

/**
 * The one rule behind both locked controls: a shape is the outline of the
 * background plate, and a maskable icon is a full-bleed plate a launcher crops.
 * With no background there is neither.
 */
export function needsBackground(options: Pick<FaviconOptions, "transparent">): boolean {
    return !options.transparent;
}

export function maskableApplies(
    options: Pick<FaviconOptions, "transparent" | "maskable">,
): boolean {
    return options.maskable && needsBackground(options);
}

/** Every field complaint at once, in field order; empty when the pack can be drawn. */
export function checkFaviconOptions(options: FaviconOptions): readonly FaviconFailureReason[] {
    const failures: FaviconFailureReason[] = [];

    if (!hasVisibleText(options.text)) {
        failures.push("empty_text");
    }

    if (!HEX_COLOR_PATTERN.test(options.foreground)) {
        failures.push("invalid_foreground");
    }

    if (!options.transparent && !HEX_COLOR_PATTERN.test(options.background)) {
        failures.push("invalid_background");
    }

    return failures;
}

/** The manifest's name: the reader's own, or the text the icon shows. */
export function resolveAppName(options: Pick<FaviconOptions, "appName" | "text">): string {
    return options.appName.trim() || options.text.trim();
}

/**
 * The manifest fields only this tool can fill in, because it chose the colours.
 * Omitted while transparent: a theme colour the icon does not have is a guess.
 */
export function manifestExtras(options: FaviconOptions): WebManifestExtras {
    if (options.transparent) {
        return {};
    }

    const color = options.background.toLowerCase();

    return { themeColor: color, backgroundColor: color, maskable: maskableApplies(options) };
}
