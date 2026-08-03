import type { RgbaImage } from "@/modules/blur-placeholder/types";

/**
 * Deterministic test pictures.
 *
 * A fixture module rather than a helper inside one test file, because both the
 * codec's own tests and the cross-check against the reference implementation
 * have to run on exactly the same pixels — a comparison against another encoder
 * proves nothing if the two are fed different bytes.
 *
 * The generator is a plain LCG rather than `Math.random`, so a failing case can
 * be reproduced from its seed alone.
 */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;

        return state / 0x1_0000_0000;
    };
}

/** Uniform noise — the worst case for a low-frequency transform. */
export function noiseImage(width: number, height: number, seed: number): RgbaImage {
    const random = seededRandom(seed);
    const data = new Uint8ClampedArray(width * height * 4);

    for (let index = 0; index < data.length; index += 4) {
        data[index] = Math.floor(random() * 256);
        data[index + 1] = Math.floor(random() * 256);
        data[index + 2] = Math.floor(random() * 256);
        data[index + 3] = 255;
    }

    return { data, width, height };
}

/** A smooth two-axis gradient — what a photograph's low frequencies look like. */
export function gradientImage(width: number, height: number): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;

            data[index] = Math.round((x / Math.max(1, width - 1)) * 255);
            data[index + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
            data[index + 2] = 128;
            data[index + 3] = 255;
        }
    }

    return { data, width, height };
}

export function solidImage(
    width: number,
    height: number,
    [red, green, blue]: readonly [number, number, number],
): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let index = 0; index < data.length; index += 4) {
        data[index] = red;
        data[index + 1] = green;
        data[index + 2] = blue;
        data[index + 3] = 255;
    }

    return { data, width, height };
}

/** Hard edges in both directions, which is where a truncated basis rings. */
export function checkerImage(width: number, height: number, cell: number): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;

            data[index] = dark ? 18 : 244;
            data[index + 1] = dark ? 52 : 210;
            data[index + 2] = dark ? 120 : 40;
            data[index + 3] = 255;
        }
    }

    return { data, width, height };
}
