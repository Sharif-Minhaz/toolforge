/**
 * The three families the glyph can be drawn in. `sans` and `mono` are the
 * site's own fonts, so the canvas draws what the page shows; `serif` is the
 * system's generic serif, because the site ships none.
 */
export const FAVICON_FONTS = ["sans", "mono", "serif"] as const;

export type FaviconFont = (typeof FAVICON_FONTS)[number];

/** The plate behind the glyph. Read only while the background is opaque. */
export const FAVICON_SHAPES = ["square", "rounded", "circle"] as const;

export type FaviconShape = (typeof FAVICON_SHAPES)[number];

export type FaviconOptions = {
    /** One to a few characters: a letter, initials, Bangla, an emoji. */
    readonly text: string;
    readonly font: FaviconFont;
    readonly bold: boolean;
    /** `#rrggbb`, as typed — checked by `checkFaviconOptions`. */
    readonly foreground: string;
    /** `#rrggbb`, as typed. Kept while `transparent` is on, so switching back restores it. */
    readonly background: string;
    readonly transparent: boolean;
    readonly shape: FaviconShape;
    readonly maskable: boolean;
    /** The manifest's name; blank means "use the text". */
    readonly appName: string;
};

/** Complaints about the fields, each shown beside the field it names. */
export type FaviconFailureReason =
    "empty_text" | "invisible_text" | "invalid_foreground" | "invalid_background";

/**
 * The glyph's ink, in pixels at the size it was measured at — the four
 * `actualBoundingBox*` fields of `TextMetrics`, measured from a left-aligned,
 * alphabetic-baseline origin. `left` is positive when ink sits left of it.
 */
export type InkBox = {
    readonly left: number;
    readonly right: number;
    readonly ascent: number;
    readonly descent: number;
};

/** Where the ink has to fit, in pixels on a square of edge `size`. */
export type GlyphZone =
    | { readonly kind: "square"; readonly side: number }
    | { readonly kind: "circle"; readonly diameter: number };

/** What sits behind the glyph: a shaped plate, a full-bleed square, or nothing. */
export type IconPlate = FaviconShape | "none";

/**
 * Which client an icon is for. `icon` is the ico, the tab PNG and the
 * manifest's `any` pair; `apple` is the home-screen icon iOS masks itself;
 * `maskable` is the pair a launcher may crop to any shape.
 */
export type IconPurpose = "icon" | "apple" | "maskable";

export type IconPlan = {
    readonly size: number;
    readonly plate: IconPlate;
    readonly zone: GlyphZone;
};

/** Where to put the text so its ink is centred in the zone. */
export type GlyphLayout = {
    readonly fontSize: number;
    /** Origin for `fillText` with `textAlign = "left"`, `textBaseline = "alphabetic"`. */
    readonly x: number;
    readonly y: number;
};
