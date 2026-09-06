import type { PixelSize } from "@/modules/tools/types";

import type { Heightfield, HeightSource, ModelOptions } from "../types";
import { MAX_RESOLUTION, MIN_RESOLUTION } from "./constants";

/**
 * The part of `ImageData` this layer reads, as a plain shape so the whole
 * pipeline is testable without a canvas.
 */
export type SourcePixels = {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
};

/** Rec. 709 luma, the same weights a browser uses for `grayscale()`. */
const LUMA_RED = 0.2126;
const LUMA_GREEN = 0.7152;
const LUMA_BLUE = 0.0722;

/**
 * The sample grid for a picture, longest edge first.
 *
 * Two samples minimum on each axis: one would give a grid with no cells and
 * therefore no triangles, and a 1-pixel-tall picture is a legal PNG.
 */
export function gridSizeFor(size: PixelSize, resolution: number): PixelSize {
    const clamped = Math.round(Math.min(MAX_RESOLUTION, Math.max(MIN_RESOLUTION, resolution)));
    const longest = Math.max(size.width, size.height);

    if (longest <= 0) {
        return { width: 2, height: 2 };
    }

    const scale = clamped / longest;

    return {
        width: Math.max(2, Math.round(size.width * scale)),
        height: Math.max(2, Math.round(size.height * scale)),
    };
}

/**
 * The pixel window a grid sample averages over.
 *
 * Samples sit *on* the picture's edges rather than in the middle of equal
 * slices — vertex 0 is the left edge and vertex `columns - 1` is the right one
 * — because that is what makes the geometry line up with the texture that is
 * stretched across it. The window is therefore centred on the sample and half
 * as wide at the two ends, which is the correct average for a point that has
 * picture on one side only.
 */
function sampleWindow(index: number, samples: number, pixels: number): [number, number] {
    // A single sample has no spacing to divide by and covers the whole axis.
    // `gridSizeFor` never returns one, but this function is the reusable half
    // and `0 / 0` would put a NaN into every pixel downstream of it.
    const span = samples > 1 ? pixels / (samples - 1) : pixels;
    const centre = samples > 1 ? (index / (samples - 1)) * (pixels - 1) : (pixels - 1) / 2;

    const start = Math.max(0, Math.round(centre - span / 2));
    const end = Math.min(pixels, Math.max(start + 1, Math.round(centre + span / 2) + 1));

    return [start, end];
}

/**
 * Box-averages the picture onto the grid, compositing over white on the way.
 *
 * Averaging first and compositing second would be wrong: the RGB under a fully
 * transparent pixel is arbitrary — encoders leave black, white or whatever the
 * last opaque neighbour held — and letting it into the average puts a halo
 * around every cut-out. Compositing each pixel over white before it is averaged
 * makes the result exactly what the reader sees on the page, which is also what
 * the texture and the per-vertex colours have to agree with.
 *
 * The composite is done in sRGB rather than linear light, matching
 * `tools/domain/pixels.ts` — one convention across the image tools beats a more
 * defensible one used in half of them.
 *
 * Returns four floats per cell: composited R, G, B in 0..255, and the *raw*
 * average alpha, which is the one channel that must survive the composite to be
 * usable as a height source at all.
 */
export function resampleToGrid(pixels: SourcePixels, grid: PixelSize): Float32Array {
    const samples = new Float32Array(grid.width * grid.height * 4);
    const { data, width: imageWidth } = pixels;

    for (let row = 0; row < grid.height; row += 1) {
        const [top, bottom] = sampleWindow(row, grid.height, pixels.height);

        for (let column = 0; column < grid.width; column += 1) {
            const [left, right] = sampleWindow(column, grid.width, imageWidth);

            let red = 0;
            let green = 0;
            let blue = 0;
            let alpha = 0;
            let counted = 0;

            for (let y = top; y < bottom; y += 1) {
                for (let x = left; x < right; x += 1) {
                    const offset = (y * imageWidth + x) * 4;
                    const pixelAlpha = data[offset + 3];
                    const opacity = pixelAlpha / 255;
                    const matte = 255 * (1 - opacity);

                    red += data[offset] * opacity + matte;
                    green += data[offset + 1] * opacity + matte;
                    blue += data[offset + 2] * opacity + matte;
                    alpha += pixelAlpha;
                    counted += 1;
                }
            }

            const target = (row * grid.width + column) * 4;

            samples[target] = red / counted;
            samples[target + 1] = green / counted;
            samples[target + 2] = blue / counted;
            samples[target + 3] = alpha / counted;
        }
    }

    return samples;
}

/** One sample's height in 0..1, before smoothing. */
function heightOf(samples: Float32Array, offset: number, source: HeightSource): number {
    switch (source) {
        case "alpha":
            return samples[offset + 3] / 255;
        case "red":
            return samples[offset] / 255;
        case "green":
            return samples[offset + 1] / 255;
        case "blue":
            return samples[offset + 2] / 255;
        case "luminance":
            return (
                (LUMA_RED * samples[offset] +
                    LUMA_GREEN * samples[offset + 1] +
                    LUMA_BLUE * samples[offset + 2]) /
                255
            );
    }
}

export function heightsFromSamples(
    samples: Float32Array,
    source: HeightSource,
    invert: boolean,
): Float32Array {
    const count = samples.length / 4;
    const heights = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
        const height = heightOf(samples, index * 4, source);

        heights[index] = invert ? 1 - height : height;
    }

    return heights;
}

/** The opacity of each grid point in 0..1 — the silhouette, before it is one. */
export function alphaFromSamples(samples: Float32Array): Float32Array {
    const count = samples.length / 4;
    const alpha = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
        alpha[index] = samples[index * 4 + 3] / 255;
    }

    return alpha;
}

export function colorsFromSamples(samples: Float32Array): Uint8Array {
    const count = samples.length / 4;
    const colors = new Uint8Array(count * 3);

    for (let index = 0; index < count; index += 1) {
        colors[index * 3] = Math.round(samples[index * 4]);
        colors[index * 3 + 1] = Math.round(samples[index * 4 + 1]);
        colors[index * 3 + 2] = Math.round(samples[index * 4 + 2]);
    }

    return colors;
}

/**
 * `passes` separable 1-2-1 binomial blurs, clamped at the edges.
 *
 * Separable rather than a 3×3 kernel so the cost is linear in the radius, and
 * clamped rather than wrapped because a clamped edge keeps the border of the
 * relief at the height the picture's border actually had — a wrapped one folds
 * the opposite side of the photograph into it.
 */
export function smoothHeights(
    heights: Float32Array,
    grid: PixelSize,
    passes: number,
): Float32Array {
    let current = heights;

    for (let pass = 0; pass < passes; pass += 1) {
        current = blurAxis(current, grid, true);
        current = blurAxis(current, grid, false);
    }

    return current === heights ? Float32Array.from(heights) : current;
}

function blurAxis(heights: Float32Array, grid: PixelSize, horizontal: boolean): Float32Array {
    const output = new Float32Array(heights.length);
    const { width, height } = grid;

    for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
            const index = row * width + column;
            const step = horizontal ? 1 : width;
            const position = horizontal ? column : row;
            const limit = horizontal ? width : height;

            const before = position > 0 ? heights[index - step] : heights[index];
            const after = position < limit - 1 ? heights[index + step] : heights[index];

            output[index] = (before + 2 * heights[index] + after) / 4;
        }
    }

    return output;
}

export function buildHeightfield(
    pixels: SourcePixels,
    options: Pick<ModelOptions, "resolution" | "source" | "invert" | "smoothing">,
): Heightfield {
    const grid = gridSizeFor({ width: pixels.width, height: pixels.height }, options.resolution);
    const samples = resampleToGrid(pixels, grid);
    const raw = heightsFromSamples(samples, options.source, options.invert);

    return {
        columns: grid.width,
        rows: grid.height,
        heights: smoothHeights(raw, grid, options.smoothing),
        colors: colorsFromSamples(samples),
        alpha: alphaFromSamples(samples),
    };
}
