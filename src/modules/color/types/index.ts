/** The formats the converter emits, in the order the workbench lists them. */
export const COLOR_FORMATS = ["hex", "rgb", "hsl", "hsv", "cmyk", "oklch"] as const;

export type ColorFormat = (typeof COLOR_FORMATS)[number];

/**
 * What the parser recognised the input as. Wider than `ColorFormat`, because a
 * CSS keyword is something you can type but not something the tool emits.
 */
export const COLOR_SYNTAXES = [...COLOR_FORMATS, "named"] as const;

export type ColorSyntax = (typeof COLOR_SYNTAXES)[number];

/**
 * `modern` writes CSS Color 4 syntax — `rgb(196 104 149 / 50%)`. `legacy`
 * writes the comma form every browser has understood since 2000.
 */
export const COLOR_NOTATIONS = ["modern", "legacy"] as const;

export type ColorNotation = (typeof COLOR_NOTATIONS)[number];

export const HEX_CASINGS = ["lower", "upper"] as const;

export type HexCasing = (typeof HEX_CASINGS)[number];

/** Channels 0–255. Integers: this is what a screen actually shows. */
export type Rgb = {
    readonly r: number;
    readonly g: number;
    readonly b: number;
};

/** Hue 0–360, saturation and lightness 0–100. */
export type Hsl = {
    readonly h: number;
    readonly s: number;
    readonly l: number;
};

/** Hue 0–360, saturation and value 0–100. */
export type Hsv = {
    readonly h: number;
    readonly s: number;
    readonly v: number;
};

/** Every channel 0–100. */
export type Cmyk = {
    readonly c: number;
    readonly m: number;
    readonly y: number;
    readonly k: number;
};

/** Lightness 0–1, chroma 0–~0.4, hue 0–360. */
export type Oklch = {
    readonly l: number;
    readonly c: number;
    readonly h: number;
};

/**
 * The picker's single source of truth. HSV rather than HSL because dragging to
 * a corner of the saturation/value square and back has to come home to the same
 * hue — HSL collapses saturation at both ends of lightness and loses it.
 * Alpha is 0–1.
 */
export type Hsva = Hsv & { readonly a: number };

export type ColorParseFailureReason =
    | "empty"
    /** Longer than the input ceiling; almost certainly a paste of something else. */
    | "too_long"
    | "unrecognised";

export type ColorParseFailure = {
    readonly ok: false;
    readonly reason: ColorParseFailureReason;
};

export type ColorParseSuccess = {
    readonly ok: true;
    readonly color: Hsva;
    /** Which notation the input turned out to be, for the "read as" hint. */
    readonly syntax: ColorSyntax;
};

export type ColorParseResult = ColorParseSuccess | ColorParseFailure;

/** Everything the format rows can be told about how to render themselves. */
export type ColorFormatOptions = {
    readonly notation: ColorNotation;
    readonly hexCasing: HexCasing;
};

/** One rendered row in the format list. */
export type FormattedColor = {
    readonly format: ColorFormat;
    readonly value: string;
    /** True when the format cannot carry the current alpha, so it was dropped. */
    readonly alphaDropped: boolean;
};

/** WCAG 2.1 conformance for one foreground/background pairing. */
export type ContrastLevel = "fail" | "aaLarge" | "aa" | "aaa";

export type ContrastCheck = {
    /** Rounded to two decimals, the precision WCAG results are quoted at. */
    readonly ratio: number;
    readonly level: ContrastLevel;
    /** 3:1, the floor for icons, borders, and other non-text UI. */
    readonly passesUi: boolean;
};

export type ContrastReport = {
    readonly onBlack: ContrastCheck;
    readonly onWhite: ContrastCheck;
    /** Whichever of black or white is legible on this colour. */
    readonly bestTextOn: "black" | "white";
};

/** Tailwind's shade ladder, reused so a generated scale drops straight in. */
export const COLOR_SCALE_STEPS = [
    "50",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
    "950",
] as const;

export type ColorScaleStep = (typeof COLOR_SCALE_STEPS)[number];

export type ColorScaleStop = {
    readonly step: ColorScaleStep;
    readonly rgb: Rgb;
    readonly hex: string;
    /** True for the stop nearest the colour the user actually picked. */
    readonly isBase: boolean;
};

/** The nearest entry in one of the built-in palettes. */
export type SwatchMatch = {
    readonly name: string;
    readonly rgb: Rgb;
    readonly hex: string;
    /** OKLab ΔE — under ~0.02 is indistinguishable, over ~0.1 is a different colour. */
    readonly distance: number;
    /** True when the input is that swatch, allowing for rounding. */
    readonly exact: boolean;
};

export type ColorExportRequest = {
    readonly color: Hsva;
    readonly options: ColorFormatOptions;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
