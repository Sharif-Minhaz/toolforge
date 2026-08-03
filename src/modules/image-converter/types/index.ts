/**
 * What the reader picks in the target control.
 *
 * The first four name one encoder outright. `ico` and `favicon` are containers
 * built out of PNGs rather than formats of their own, and they sit in the same
 * union for the same reason the compressor's `auto` and `smallest` do: it is
 * one control to the person using it, and a literal union keeps every
 * `targets.<value>` message key statically checkable.
 */
export const CONVERSION_TARGETS = ["png", "jpeg", "webp", "avif", "ico", "favicon"] as const;

export type ConversionTarget = (typeof CONVERSION_TARGETS)[number];

/**
 * What sits behind a picture that has transparency in it.
 *
 * `transparent` keeps the alpha channel. JPEG has none, so the control drops
 * that entry when JPEG is the target rather than accepting a setting it would
 * have to ignore.
 */
export const BACKGROUND_CHOICES = ["transparent", "white", "black"] as const;

export type BackgroundChoice = (typeof BACKGROUND_CHOICES)[number];

/**
 * The square edges an `.ico` may carry. 16, 32 and 48 are the three Windows
 * and every browser actually look for; the rest are there because a desktop
 * shortcut and a high-DPI tab do use them.
 */
export const ICON_SIZES = [16, 32, 48, 64, 128, 256] as const;

export type IconSize = (typeof ICON_SIZES)[number];

export type ConversionOptions = {
    readonly target: ConversionTarget;
    /** 10–100. Spent only by JPEG, WebP and AVIF. */
    readonly quality: number;
    /** Longest-edge cap in pixels, or `null` to keep the original dimensions. */
    readonly maxEdge: number | null;
    readonly background: BackgroundChoice;
    /** Never empty — the size control refuses to clear its last entry. */
    readonly iconSizes: readonly IconSize[];
};

/** One file a conversion produced. A pack produces several; a re-encode, one. */
export type ConvertedFile = {
    /** The name it takes inside a ZIP, and the name it downloads under alone. */
    readonly name: string;
    readonly bytes: number;
    readonly blob: Blob;
};

export type ConvertedImage = {
    readonly target: ConversionTarget;
    readonly files: readonly ConvertedFile[];
    readonly totalBytes: number;
    /** The largest square an icon target wrote, or the raster output's size. */
    readonly width: number;
    readonly height: number;
    /** The squares written into an `.ico`; empty for a raster target. */
    readonly iconSizes: readonly number[];
    /** True when transparency was composited onto the background colour. */
    readonly flattened: boolean;
    /** True when the size cap actually scaled the picture down. */
    readonly resized: boolean;
    /** True when something was asked for at a size the source cannot fill. */
    readonly upscaled: boolean;
};

/**
 * Everything that can go wrong between picking a file and holding a converted
 * one. `empty_file`, `unsupported_type` and `too_large` come from the shared
 * `checkImageFile` gate; the rest belong to this tool.
 */
export type ConversionFailureReason =
    | "empty_file"
    | "unsupported_type"
    | "too_large"
    | "too_many_files"
    | "too_many_pixels"
    | "undecodable"
    | "encode_failed";

export type ConversionOutcome =
    | { readonly ok: true; readonly image: ConvertedImage }
    | { readonly ok: false; readonly reason: ConversionFailureReason };
