import type { CropRect, RenderPlan, RgbaImage } from "../types";
import type { MatteColor } from "@/modules/tools/types";

/**
 * The two pixel operations this tool actually performs, as array arithmetic.
 *
 * Deliberately not `canvas.drawImage`. Not because the canvas is wrong, but
 * because these two steps are where "just remove the exceeded part" is either
 * true or not, and a claim about pixels that is only checkable by looking at a
 * picture is a claim nobody checks. Written this way, `bun test` asserts that a
 * crop copies the exact bytes it selected and that a letterboxed photograph has
 * the background colour in the letterbox and the photograph everywhere else.
 *
 * The only step left to a library is the scale itself, which is Lanczos3 in
 * `tools/domain/image-codec.ts` for the reason recorded there.
 */

/**
 * Copies a rectangle out of an image.
 *
 * A straight row-wise copy: no interpolation, no colour conversion, no rounding
 * — byte `n` of the output is byte `n` of the input, offset. That is the whole
 * of the tool's headline promise, and the reason the crop is done here rather
 * than as a `drawImage` with a source rectangle, which is free to resample at
 * the driver's discretion.
 *
 * The rectangle is expected to be integral and inside the image; `clampCrop` is
 * what guarantees that, and the intersection below is belt and braces rather
 * than a second policy.
 */
export function cropPixels(source: RgbaImage, rect: CropRect): RgbaImage {
    const x = Math.max(0, Math.min(Math.round(rect.x), source.width));
    const y = Math.max(0, Math.min(Math.round(rect.y), source.height));
    const width = Math.max(1, Math.min(Math.round(rect.width), source.width - x));
    const height = Math.max(1, Math.min(Math.round(rect.height), source.height - y));

    const data = new Uint8ClampedArray(width * height * 4);
    const rowBytes = width * 4;

    for (let row = 0; row < height; row += 1) {
        const from = ((y + row) * source.width + x) * 4;

        data.set(source.data.subarray(from, from + rowBytes), row * rowBytes);
    }

    return { width, height, data };
}

/**
 * Puts the scaled crop onto the output canvas.
 *
 * Handles all three fit modes at once, because after `planRender` they differ
 * only in where the draw box is: `contain` leaves background around it, `cover`
 * pushes it past the edges and the loop clips, `stretch` matches it exactly.
 *
 * Composited **source-over** rather than copied, so a PNG with a transparent
 * background over a white matte comes out white rather than keeping the hole.
 *
 * Canvas pixels are unpremultiplied, which is what the division below is for
 * and the one part of this easy to get wrong: the premultiplied form
 * `src·a + dst·(1−a)` is right only when the destination is opaque. Over a
 * transparent canvas it darkens every translucent pixel towards zero — a 50%
 * grey lands as a 50% *black*, and the mistake is invisible until somebody
 * opens the PNG on a light background.
 */
export function composePixels(scaled: RgbaImage, plan: RenderPlan): RgbaImage {
    const { width, height } = plan.canvas;
    const data = new Uint8ClampedArray(width * height * 4);

    if (plan.matte !== null) {
        fillMatte(data, plan.matte);
    }

    const startX = Math.max(0, plan.draw.x);
    const startY = Math.max(0, plan.draw.y);
    const endX = Math.min(width, plan.draw.x + scaled.width);
    const endY = Math.min(height, plan.draw.y + scaled.height);

    for (let y = startY; y < endY; y += 1) {
        const sourceRow = (y - plan.draw.y) * scaled.width;
        const targetRow = y * width;

        for (let x = startX; x < endX; x += 1) {
            const from = (sourceRow + (x - plan.draw.x)) * 4;
            const to = (targetRow + x) * 4;
            const sourceAlpha = scaled.data[from + 3] / 255;

            // The overwhelmingly common case, and exact: an opaque pixel over
            // anything is that pixel, byte for byte.
            if (sourceAlpha === 1) {
                data[to] = scaled.data[from];
                data[to + 1] = scaled.data[from + 1];
                data[to + 2] = scaled.data[from + 2];
                data[to + 3] = 255;

                continue;
            }

            const targetAlpha = data[to + 3] / 255;
            const remainder = targetAlpha * (1 - sourceAlpha);
            const outAlpha = sourceAlpha + remainder;

            if (outAlpha === 0) {
                continue;
            }

            data[to] = (scaled.data[from] * sourceAlpha + data[to] * remainder) / outAlpha;
            data[to + 1] =
                (scaled.data[from + 1] * sourceAlpha + data[to + 1] * remainder) / outAlpha;
            data[to + 2] =
                (scaled.data[from + 2] * sourceAlpha + data[to + 2] * remainder) / outAlpha;
            data[to + 3] = outAlpha * 255;
        }
    }

    return { width, height, data };
}

function fillMatte(data: Uint8ClampedArray, matte: MatteColor): void {
    for (let index = 0; index < data.length; index += 4) {
        data[index] = matte.r;
        data[index + 1] = matte.g;
        data[index + 2] = matte.b;
        data[index + 3] = 255;
    }
}
