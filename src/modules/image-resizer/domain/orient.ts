import type { PixelSize } from "@/modules/tools/types";
import type { FlipAxis, RgbaImage } from "../types";

/**
 * Turning a picture, as two operations that are not the same kind of thing.
 *
 * A quarter turn and a mirror are **permutations**: every output pixel is some
 * input pixel, moved. Nothing is interpolated, nothing is averaged, and the
 * bytes that come out are the bytes that went in — the same promise
 * `cropPixels` makes in `compose.ts`, and checkable the same way.
 *
 * A free angle cannot be. A pixel grid rotated 37° does not land on a pixel
 * grid, so every output pixel is a weighted average of four inputs and the
 * corners of the result are outside the original picture altogether. That is a
 * resample, it is lossy, and the tool says so beside the control rather than
 * letting the two feel alike.
 *
 * The dispatcher below is what keeps the distinction honest: an angle that
 * happens to be a multiple of 90° takes the exact path, so a reader who types
 * `180` gets the permutation and not a bilinear approximation of it.
 */

/** Degrees the angle field accepts. Wider than one turn so ±270 is typable. */
export const MIN_ANGLE = -360;
export const MAX_ANGLE = 360;

/**
 * Folds an angle into `(-180, 180]`.
 *
 * Rotating by 350° and by −10° are the same picture, and the second is the one
 * with less to resample.
 */
export function normalizeAngle(degrees: number): number {
    if (!Number.isFinite(degrees)) {
        return 0;
    }

    const wrapped = ((degrees % 360) + 360) % 360;

    return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** How many clockwise quarter turns an angle is, or `null` if it is not a whole number of them. */
export function quarterTurnsFor(degrees: number): number | null {
    const normalized = normalizeAngle(degrees);

    return normalized % 90 === 0 ? (((normalized / 90) % 4) + 4) % 4 : null;
}

/**
 * Rotates by a whole number of quarter turns, clockwise.
 *
 * Written as an inverse mapping — for each destination pixel, which source
 * pixel is it — because the forward direction has to invert the same arithmetic
 * anyway and gets the rounding wrong at the edges when it does.
 */
export function rotateQuarterTurns(image: RgbaImage, turns: number): RgbaImage {
    const steps = (((Math.round(turns) % 4) + 4) % 4) as 0 | 1 | 2 | 3;

    if (steps === 0) {
        return image;
    }

    const swaps = steps !== 2;
    const width = swaps ? image.height : image.width;
    const height = swaps ? image.width : image.height;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const sourceX =
                steps === 1 ? y : steps === 2 ? image.width - 1 - x : image.width - 1 - y;
            const sourceY =
                steps === 1 ? image.height - 1 - x : steps === 2 ? image.height - 1 - y : x;

            const from = (sourceY * image.width + sourceX) * 4;
            const to = (y * width + x) * 4;

            data[to] = image.data[from];
            data[to + 1] = image.data[from + 1];
            data[to + 2] = image.data[from + 2];
            data[to + 3] = image.data[from + 3];
        }
    }

    return { width, height, data };
}

/**
 * Mirrors the picture.
 *
 * `horizontal` swaps left and right — the mirror somebody means when they say a
 * selfie came out backwards. `vertical` swaps top and bottom, and is a row-wise
 * `TypedArray.set` because whole rows move together.
 */
export function flipPixels(image: RgbaImage, axis: FlipAxis): RgbaImage {
    const { width, height } = image;
    const data = new Uint8ClampedArray(width * height * 4);
    const rowBytes = width * 4;

    if (axis === "vertical") {
        for (let y = 0; y < height; y += 1) {
            const from = (height - 1 - y) * rowBytes;

            data.set(image.data.subarray(from, from + rowBytes), y * rowBytes);
        }

        return { width, height, data };
    }

    for (let y = 0; y < height; y += 1) {
        const row = y * rowBytes;

        for (let x = 0; x < width; x += 1) {
            const from = row + (width - 1 - x) * 4;
            const to = row + x * 4;

            data[to] = image.data[from];
            data[to + 1] = image.data[from + 1];
            data[to + 2] = image.data[from + 2];
            data[to + 3] = image.data[from + 3];
        }
    }

    return { width, height, data };
}

/**
 * The box a freely rotated picture needs, which is always at least as big as
 * the picture and usually bigger.
 *
 * `|w·cos| + |h·sin|` is the projection of the rotated rectangle onto each
 * axis. Rounded up rather than to nearest, because a box half a pixel too small
 * cuts a corner off — the one thing a rotation must not do.
 *
 * The quarter turns are answered before any trigonometry runs, and that is not
 * a shortcut. `Math.sin(Math.PI)` is 1.2 × 10⁻¹⁶ rather than zero, and rounding
 * *up* turns that speck into a whole extra pixel — a half turn came back one
 * pixel wider and one taller on each side, which is a transparent hairline down
 * two edges of the picture every time somebody pressed it.
 */
export function rotatedSize(size: PixelSize, degrees: number): PixelSize {
    const turns = quarterTurnsFor(degrees);

    if (turns !== null) {
        const swaps = turns % 2 === 1;

        return {
            width: swaps ? size.height : size.width,
            height: swaps ? size.width : size.height,
        };
    }

    const radians = (normalizeAngle(degrees) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));

    return {
        width: Math.max(1, Math.ceil(size.width * cos + size.height * sin)),
        height: Math.max(1, Math.ceil(size.width * sin + size.height * cos)),
    };
}

/**
 * Rotates by any angle, clockwise, about the centre.
 *
 * Bilinear, and sampled **premultiplied**. Averaging unpremultiplied RGBA drags
 * the colour of transparent pixels into their neighbours, which is invisible
 * over an opaque picture and shows up as a dark fringe the moment a PNG with a
 * hole in it is turned. The same reasoning as `composePixels`, in the other
 * direction: multiply by alpha to average, divide by the result to store.
 *
 * Anything sampled from outside the source contributes nothing at all, so the
 * new corners come out fully transparent and the diagonal edge fades rather
 * than staircasing. Transparency rather than a background colour on purpose:
 * the matte belongs to the export, where `renderImage` already flattens it for
 * a format that has no alpha, and baking one in here would put white corners
 * inside a PNG that did not ask for them.
 */
export function rotatePixels(image: RgbaImage, degrees: number): RgbaImage {
    const turns = quarterTurnsFor(degrees);

    if (turns !== null) {
        return rotateQuarterTurns(image, turns);
    }

    const radians = (normalizeAngle(degrees) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const { width, height } = rotatedSize(image, degrees);
    const data = new Uint8ClampedArray(width * height * 4);

    const sourceCenterX = image.width / 2 - 0.5;
    const sourceCenterY = image.height / 2 - 0.5;

    for (let y = 0; y < height; y += 1) {
        const offsetY = y + 0.5 - height / 2;

        for (let x = 0; x < width; x += 1) {
            const offsetX = x + 0.5 - width / 2;

            sample(
                image,
                offsetX * cos + offsetY * sin + sourceCenterX,
                offsetY * cos - offsetX * sin + sourceCenterY,
                data,
                (y * width + x) * 4,
            );
        }
    }

    return { width, height, data };
}

/** One bilinear tap, written straight into the destination buffer. */
function sample(image: RgbaImage, x: number, y: number, data: Uint8ClampedArray, to: number): void {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const fractionX = x - left;
    const fractionY = y - top;

    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let row = 0; row < 2; row += 1) {
        const sourceY = top + row;

        if (sourceY < 0 || sourceY >= image.height) {
            continue;
        }

        const weightY = row === 0 ? 1 - fractionY : fractionY;

        for (let column = 0; column < 2; column += 1) {
            const sourceX = left + column;

            if (sourceX < 0 || sourceX >= image.width) {
                continue;
            }

            const weight = weightY * (column === 0 ? 1 - fractionX : fractionX);

            if (weight === 0) {
                continue;
            }

            const from = (sourceY * image.width + sourceX) * 4;
            const sourceAlpha = (image.data[from + 3] / 255) * weight;

            red += image.data[from] * sourceAlpha;
            green += image.data[from + 1] * sourceAlpha;
            blue += image.data[from + 2] * sourceAlpha;
            alpha += sourceAlpha;
        }
    }

    // Nothing covered this pixel, or everything that did was transparent. The
    // buffer is already zeroed, and dividing would be a division by zero.
    if (alpha === 0) {
        return;
    }

    data[to] = red / alpha;
    data[to + 1] = green / alpha;
    data[to + 2] = blue / alpha;
    data[to + 3] = alpha * 255;
}
