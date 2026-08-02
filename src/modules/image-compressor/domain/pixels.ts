import { JPEG_MATTE_RGB } from "./constants";

/**
 * The part of `ImageData` these functions read. A plain shape rather than the
 * DOM type, so the rules are testable without a canvas.
 */
export type RgbaPixels = {
    readonly data: Uint8ClampedArray;
};

export type MatteColor = {
    readonly r: number;
    readonly g: number;
    readonly b: number;
};

/**
 * True when every pixel is fully opaque.
 *
 * Scanned in full rather than sampled: one translucent pixel is the difference
 * between a JPEG that is correct and a JPEG with a black square in it, and the
 * answer also decides whether JPEG competes at all under `smallest`.
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
    matte: MatteColor = JPEG_MATTE_RGB,
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
