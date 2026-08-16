/**
 * The swatches in the Colour tab.
 *
 * Raw hex literals, and the second place in this repository where that is correct
 * rather than a rule broken: these are not surfaces the theme paints, they are
 * **the reader's chosen output pixels**. A `--brand-rose` behind somebody's
 * product photograph would change colour when they switched to dark mode, which
 * is the opposite of what a background colour is for. See
 * `docs/case-studies/watermark-remover.md` for the other one.
 *
 * Untranslated for the same reason `UTF-8` is: a colour value is data. The
 * swatch's accessible name is built from the message catalogue at the point of
 * use, so a screen reader still hears something in the reader's own language.
 */
export const BACKGROUND_SWATCHES = [
    "#ffffff",
    "#f2f2f2",
    "#111111",
    "#ff3b30",
    "#ff2d78",
    "#af52de",
    "#7c3aed",
    "#3b5bdb",
    "#1e9bf0",
    "#0bc5ea",
    "#12b8a6",
    "#0f9d58",
    "#7cb342",
    "#f5b301",
    "#fb8c00",
    "#8d6e63",
    "#f8d7c4",
    "#cfe8ff",
    "#dcedc8",
    "#fde2e4",
] as const;

/**
 * A short, stable name for one swatch, used to build its message key.
 *
 * The keys are a literal union rather than the hex strings themselves, because
 * `t(\`swatches.${hex}\`)` would put `#` and hex digits into a message key and
 * `docs/internationalization.md` only guarantees type-checked keys built from
 * unions. The two lists are the same length and in the same order, which
 * `tests/palette.test.ts` is what enforces.
 */
export const SWATCH_NAMES = [
    "white",
    "paper",
    "ink",
    "red",
    "pink",
    "orchid",
    "violet",
    "indigo",
    "sky",
    "cyan",
    "teal",
    "green",
    "lime",
    "amber",
    "orange",
    "clay",
    "peach",
    "mist",
    "sage",
    "blush",
] as const;

export type SwatchName = (typeof SWATCH_NAMES)[number];

/** Pairs the two lists, so the grid iterates one thing instead of two by index. */
export const SWATCHES: readonly { readonly name: SwatchName; readonly color: string }[] =
    SWATCH_NAMES.map((name, index) => ({ name, color: BACKGROUND_SWATCHES[index] }));

/**
 * Whether a swatch needs a dark outline to be visible against the picker.
 *
 * The near-whites vanish into a light card and the near-blacks into a dark one,
 * so the tile gets a ring in both cases. Computed from relative luminance rather
 * than listed by hand, so adding a swatch above cannot forget it.
 */
export function needsSwatchOutline(hex: string): boolean {
    const luminance = relativeLuminance(hex);

    return luminance > 0.82 || luminance < 0.06;
}

/** sRGB relative luminance, per WCAG 2.x. Returns 0 for anything unparseable. */
export function relativeLuminance(hex: string): number {
    const body = hex.startsWith("#") ? hex.slice(1) : hex;

    if (!/^[0-9a-fA-F]{6}$/.test(body)) {
        return 0;
    }

    const channels = [0, 2, 4].map((offset) => {
        const value = Number.parseInt(body.slice(offset, offset + 2), 16) / 255;

        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
