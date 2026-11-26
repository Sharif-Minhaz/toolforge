import type { FaviconOptions } from "../types";

/**
 * UTF-16 units, which is what `maxLength` counts. Twelve holds the longest
 * emoji in common use — a four-person family ZWJ sequence is eleven — and a
 * few Bangla conjuncts; anything longer is unreadable at 16 pixels anyway.
 */
export const MAX_TEXT_LENGTH = 12;

/** Launchers truncate a home-screen label well before this; it is a ceiling, not a target. */
export const MAX_APP_NAME_LENGTH = 30;

/** `#rrggbb`, the one spelling the colour fields take. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_OPTIONS: FaviconOptions = {
    text: "A",
    font: "sans",
    bold: true,
    foreground: "#ffffff",
    background: "#4f46e5",
    transparent: false,
    shape: "rounded",
    maskable: false,
    appName: "",
};

/**
 * How much of the edge the ink may take, per plate. A square or rounded plate
 * keeps a tenth clear on each side, so the glyph never touches the corner
 * curve; with no plate there is no edge to clear, so the glyph takes more.
 */
export const PLATE_GLYPH_FILL = 0.8;

export const BARE_GLYPH_FILL = 0.9;

/** The ink box's diagonal, as a share of the circle plate's diameter. */
export const CIRCLE_GLYPH_FILL = 0.9;

/**
 * The W3C maskable safe zone: a centred circle of radius 40% of the edge,
 * which every launcher mask is guaranteed to contain.
 * https://www.w3.org/TR/appmanifest/#icon-masks
 */
export const MASKABLE_SAFE_ZONE = 0.8;

/** Corner radius of the rounded plate, as a share of the edge. */
export const ROUNDED_CORNER = 0.2;

/** The size text is measured at before it is scaled to each icon. */
export const REFERENCE_FONT_SIZE = 200;

export const PACK_FILENAME = "favicon-pack.zip";
