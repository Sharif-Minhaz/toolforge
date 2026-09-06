/**
 * Design tokens, in the units WebGL takes.
 *
 * COBE's colours are `[r, g, b]` floats between 0 and 1. There is no path from
 * a CSS custom property into a WebGL uniform, so something has to do the
 * conversion — and the alternative to doing it here is a hard-coded palette
 * that silently stops matching the site the first time a token moves.
 *
 * The half that needs a browser is one line in the component: a Canvas 2D
 * context normalises any colour it understands — `oklch()` included — to
 * `#rrggbb` when you read `fillStyle` back. Everything after that is arithmetic,
 * which is why it lives here where it can be tested.
 */

/** A colour in COBE's units: three floats, each 0–1. */
export type RgbTriplet = readonly [number, number, number];

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `#4f46e5` → `[0.31, 0.275, 0.898]`.
 *
 * `null` for anything that is not a hex colour, so a caller falls back to a
 * readable default rather than painting the globe with `NaN` — which WebGL
 * renders as black, silently.
 */
export function hexToRgbTriplet(hex: string): RgbTriplet | null {
    const matched = HEX_COLOR.exec(hex.trim());

    if (matched === null) {
        return null;
    }

    const digits = matched[1];
    const full =
        digits.length === 3
            ? [...digits].map((digit) => `${digit}${digit}`)
            : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];

    const [red, green, blue] = full.map((pair) => Number.parseInt(pair, 16) / 255);

    return [red, green, blue];
}

/** Moves a triplet toward white, for a glow that reads as the same hue. */
export function lighten(color: RgbTriplet, amount: number): RgbTriplet {
    const ratio = Math.min(1, Math.max(0, amount));

    return [
        color[0] + (1 - color[0]) * ratio,
        color[1] + (1 - color[1]) * ratio,
        color[2] + (1 - color[2]) * ratio,
    ];
}
