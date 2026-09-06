import type { SourcePixels } from "@/modules/image-to-3d/domain/heightfield";

/** A picture built from a function of its coordinates, so a test can say what it expects. */
export function makeImage(
    width: number,
    height: number,
    paint: (x: number, y: number) => readonly [number, number, number, number],
): SourcePixels {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const [red, green, blue, alpha] = paint(x, y);
            const offset = (y * width + x) * 4;

            data[offset] = red;
            data[offset + 1] = green;
            data[offset + 2] = blue;
            data[offset + 3] = alpha;
        }
    }

    return { data, width, height };
}

export function solidImage(
    width: number,
    height: number,
    color: readonly [number, number, number, number],
): SourcePixels {
    return makeImage(width, height, () => color);
}

/** Black on the left, white on the right — a ramp whose height is its own x. */
export function rampImage(width: number, height: number): SourcePixels {
    return makeImage(width, height, (x) => {
        const value = Math.round((x / (width - 1)) * 255);

        return [value, value, value, 255];
    });
}

/** A filled circle on a transparent field — what a cut-out actually produces. */
export function discImage(width: number, height: number, radius: number): SourcePixels {
    return makeImage(width, height, (x, y) => {
        const inside = Math.hypot(x - width / 2, y - height / 2) <= radius;

        return inside ? [200, 120, 60, 255] : [0, 0, 0, 0];
    });
}

/**
 * A body, a head, a one-pixel-wide neck and a hole through the middle.
 *
 * The awkward one on purpose: thin necks and holes are where a mask carried on
 * a grid frays, and the neck is narrow enough that cells along it have a single
 * corner inside — the case that used to produce zero-area fins.
 */
export function awkwardImage(width: number, height: number): SourcePixels {
    return makeImage(width, height, (x, y) => {
        const body = Math.hypot(x - width / 3, y - height / 2) < height / 3.4;
        const head = Math.hypot(x - width * 0.73, y - height / 2) < height / 6.4;
        const neck = Math.abs(y - height / 2) < 2 && x > width / 3 && x < width * 0.73;
        const hole = Math.hypot(x - width / 3, y - height / 2) < height / 10;

        return (body || head || neck) && !hole ? [30, 200, 140, 255] : [0, 0, 0, 0];
    });
}

/** A subject that runs off the edge of the frame, so the outline is clipped. */
export function croppedImage(width: number, height: number): SourcePixels {
    return makeImage(width, height, (x, y) =>
        Math.hypot(x - width / 6, y - height / 2) < height * 0.6
            ? [90, 90, 220, 255]
            : [0, 0, 0, 0],
    );
}
