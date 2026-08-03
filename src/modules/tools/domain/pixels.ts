import type { MatteColor, PixelSize } from "../types";

/**
 * The part of `ImageData` these functions read. A plain shape rather than the
 * DOM type, so the rules are testable without a canvas.
 */
export type RgbaPixels = {
    readonly data: Uint8ClampedArray;
};

/** What a format with no alpha channel gets flattened onto unless told otherwise. */
export const WHITE_MATTE: MatteColor = { r: 255, g: 255, b: 255 };

export const BLACK_MATTE: MatteColor = { r: 0, g: 0, b: 0 };

/**
 * True when every pixel is fully opaque.
 *
 * Scanned in full rather than sampled: one translucent pixel is the difference
 * between a JPEG that is correct and a JPEG with a black square in it, and the
 * answer also decides whether JPEG is worth encoding at all.
 */
export function isOpaque(pixels: RgbaPixels): boolean {
    const { data } = pixels;

    for (let index = 3; index < data.length; index += 4) {
        if (data[index] !== 255) {
            return false;
        }
    }

    return true;
}

/**
 * Composites RGBA over a solid colour and returns opaque pixels.
 *
 * JPEG has no alpha channel, and an encoder handed transparent pixels keeps
 * whatever colour happens to sit under them — usually black, which is why a
 * logo with a transparent background turns into a black rectangle. Canvas
 * pixels are unpremultiplied, so this is the plain `src·a + matte·(1−a)` and
 * not the premultiplied form.
 */
export function flattenOntoMatte(
    pixels: RgbaPixels,
    matte: MatteColor = WHITE_MATTE,
): Uint8ClampedArray<ArrayBuffer> {
    const source = pixels.data;
    const output = new Uint8ClampedArray(source.length);

    for (let index = 0; index < source.length; index += 4) {
        const alpha = source[index + 3] / 255;
        const inverse = 1 - alpha;

        output[index] = source[index] * alpha + matte.r * inverse;
        output[index + 1] = source[index + 1] * alpha + matte.g * inverse;
        output[index + 2] = source[index + 2] * alpha + matte.b * inverse;
        output[index + 3] = 255;
    }

    return output;
}

/**
 * Scales a size down so its longest edge is at most `maxEdge`.
 *
 * Never upscales — a cap larger than the picture returns the picture. The short
 * edge is rounded and floored at one pixel, so an extreme panorama still yields
 * a decodable image rather than a zero-height one.
 */
export function fitWithinEdge(size: PixelSize, maxEdge: number | null): PixelSize {
    const longest = Math.max(size.width, size.height);

    if (maxEdge === null || maxEdge <= 0 || longest <= maxEdge) {
        return size;
    }

    const scale = maxEdge / longest;

    return {
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
    };
}
