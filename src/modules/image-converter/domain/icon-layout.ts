import type { RgbaPixels } from "@/modules/tools/domain/pixels";
import type { MatteColor, PixelSize } from "@/modules/tools/types";

/**
 * Where a picture sits inside a square icon.
 *
 * An icon is square and a photograph usually is not, so something has to give.
 * Stretching is the one option nobody wants — it is immediately visible on a
 * logo, and a logo is what people convert to icons. So the picture is scaled to
 * fit inside the square with its aspect ratio intact, and the space left over
 * is filled with the chosen background.
 */
export type IconLayout = {
    /** The square's edge. */
    readonly size: number;
    /** The scaled picture's size, never larger than the square. */
    readonly width: number;
    readonly height: number;
    /** Where its top-left corner lands inside the square. */
    readonly offsetX: number;
    readonly offsetY: number;
};

export function iconLayout(source: PixelSize, size: number): IconLayout {
    const edge = Math.max(1, Math.floor(size));
    const longest = Math.max(source.width, source.height);

    if (longest <= 0) {
        return { size: edge, width: edge, height: edge, offsetX: 0, offsetY: 0 };
    }

    const scale = edge / longest;
    // Rounding can land a hair over the edge on a near-square picture, so the
    // result is clamped rather than trusted.
    const width = clamp(Math.round(source.width * scale), edge);
    const height = clamp(Math.round(source.height * scale), edge);

    return {
        size: edge,
        width,
        height,
        // Floored, not rounded, so a one-pixel remainder falls on the bottom
        // right instead of pushing the picture off the top left.
        offsetX: Math.floor((edge - width) / 2),
        offsetY: Math.floor((edge - height) / 2),
    };
}

function clamp(value: number, max: number): number {
    return Math.min(max, Math.max(1, value));
}

/** True when the square is bigger than the picture has pixels to fill. */
export function isUpscale(source: PixelSize, size: number): boolean {
    return size > Math.max(source.width, source.height);
}

export type SourcePixels = RgbaPixels & PixelSize;

/**
 * Draws already-scaled pixels into a square canvas of their own.
 *
 * `fill` of `null` leaves the margin fully transparent, which is what an icon
 * usually wants. A colour fills the margin at full alpha — the picture itself
 * is expected to have been flattened onto the same colour already, so the two
 * meet without a seam.
 */
export function padToSquare(
    source: SourcePixels,
    layout: IconLayout,
    fill: MatteColor | null,
): Uint8ClampedArray<ArrayBuffer> {
    const output = new Uint8ClampedArray(layout.size * layout.size * 4);

    if (fill !== null) {
        for (let index = 0; index < output.length; index += 4) {
            output[index] = fill.r;
            output[index + 1] = fill.g;
            output[index + 2] = fill.b;
            output[index + 3] = 255;
        }
    }

    const width = Math.min(source.width, layout.width);
    const height = Math.min(source.height, layout.height);

    for (let row = 0; row < height; row += 1) {
        const from = row * source.width * 4;
        const to = ((row + layout.offsetY) * layout.size + layout.offsetX) * 4;

        output.set(source.data.subarray(from, from + width * 4), to);
    }

    return output;
}
