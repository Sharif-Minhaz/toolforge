import {
    COLOR_FORMATS,
    type ColorFormat,
    type ColorFormatOptions,
    type FormattedColor,
    type Hsva,
    type Rgb,
} from "../types";
import {
    hsvToHsl,
    hsvToRgb,
    rgbToCmyk,
    rgbToOklch,
    roundCmyk,
    roundHsl,
    roundHsv,
    roundOklch,
} from "./convert";

/**
 * Renders a colour into each notation the tool lists.
 *
 * `modern` and `legacy` only differ where CSS actually has two spellings.
 * OKLCH has never had a comma form, so writing one would produce a declaration
 * no browser accepts — it stays space-separated in both modes.
 */

/** Trims the trailing zeros a fixed-precision alpha would otherwise carry. */
function formatAlphaNumber(alpha: number): string {
    return Number.parseFloat(alpha.toFixed(3)).toString();
}

function formatAlphaPercent(alpha: number): string {
    return `${Number.parseFloat((alpha * 100).toFixed(1))}%`;
}

function hexPair(value: number): string {
    return value.toString(16).padStart(2, "0");
}

export function formatHex(rgb: Rgb, options: ColorFormatOptions, alpha = 1): string {
    const body = `${hexPair(rgb.r)}${hexPair(rgb.g)}${hexPair(rgb.b)}`;
    const withAlpha = alpha >= 1 ? body : `${body}${hexPair(Math.round(alpha * 255))}`;
    const hex = `#${withAlpha}`;

    return options.hexCasing === "upper" ? hex.toUpperCase() : hex;
}

/**
 * Assembles `name(a b c)`, `name(a b c / 50%)`, `name(a, b, c)` or
 * `name(a, b, c, 0.5)` from already-rendered channel strings.
 */
function joinChannels(
    name: string,
    channels: readonly string[],
    alpha: number,
    options: ColorFormatOptions,
): string {
    if (options.notation === "legacy") {
        const body = alpha >= 1 ? channels : [...channels, formatAlphaNumber(alpha)];

        return `${name}(${body.join(", ")})`;
    }

    const body = channels.join(" ");

    return alpha >= 1 ? `${name}(${body})` : `${name}(${body} / ${formatAlphaPercent(alpha)})`;
}

function formatRgb(rgb: Rgb, alpha: number, options: ColorFormatOptions): string {
    // `rgba()` is the legacy spelling; the modern form carries alpha inside
    // plain `rgb()`.
    const name = options.notation === "legacy" && alpha < 1 ? "rgba" : "rgb";

    return joinChannels(name, [`${rgb.r}`, `${rgb.g}`, `${rgb.b}`], alpha, options);
}

function formatHsl(hsva: Hsva, options: ColorFormatOptions): string {
    const hsl = roundHsl(hsvToHsl(hsva));
    const name = options.notation === "legacy" && hsva.a < 1 ? "hsla" : "hsl";

    return joinChannels(name, [`${hsl.h}`, `${hsl.s}%`, `${hsl.l}%`], hsva.a, options);
}

function formatHsv(hsva: Hsva, options: ColorFormatOptions): string {
    const hsv = roundHsv(hsva);

    return joinChannels("hsv", [`${hsv.h}`, `${hsv.s}%`, `${hsv.v}%`], hsva.a, options);
}

function formatCmyk(rgb: Rgb, options: ColorFormatOptions): string {
    const cmyk = roundCmyk(rgbToCmyk(rgb));

    // Alpha is passed as 1 on purpose: CMYK has no opacity channel, and the
    // caller reports the drop through `alphaDropped`.
    return joinChannels(
        "cmyk",
        [`${cmyk.c}%`, `${cmyk.m}%`, `${cmyk.y}%`, `${cmyk.k}%`],
        1,
        options,
    );
}

function formatOklch(rgb: Rgb, alpha: number): string {
    const oklch = roundOklch(rgbToOklch(rgb));
    const body = `${oklch.l}% ${oklch.c} ${oklch.h}`;

    return alpha >= 1 ? `oklch(${body})` : `oklch(${body} / ${formatAlphaPercent(alpha)})`;
}

/** True for the one format that cannot carry the colour's transparency. */
function dropsAlpha(format: ColorFormat, alpha: number): boolean {
    return format === "cmyk" && alpha < 1;
}

export function formatColor(format: ColorFormat, hsva: Hsva, options: ColorFormatOptions): string {
    const rgb = hsvToRgb(hsva);

    switch (format) {
        case "hex":
            return formatHex(rgb, options, hsva.a);
        case "rgb":
            return formatRgb(rgb, hsva.a, options);
        case "hsl":
            return formatHsl(hsva, options);
        case "hsv":
            return formatHsv(hsva, options);
        case "cmyk":
            return formatCmyk(rgb, options);
        case "oklch":
            return formatOklch(rgb, hsva.a);
    }
}

/** Every row the workbench renders, in catalogue order. */
export function formatAll(hsva: Hsva, options: ColorFormatOptions): readonly FormattedColor[] {
    return COLOR_FORMATS.map((format) => ({
        format,
        value: formatColor(format, hsva, options),
        alphaDropped: dropsAlpha(format, hsva.a),
    }));
}

/**
 * A value safe to hand to `style={{ background }}`. Always the hex form, so a
 * swatch renders identically no matter which notation the user is reading.
 */
export function toCssColor(hsva: Hsva): string {
    return formatHex(hsvToRgb(hsva), { notation: "modern", hexCasing: "lower" }, hsva.a);
}
