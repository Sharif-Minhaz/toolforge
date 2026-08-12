import { describe, expect, test } from "bun:test";

import { composePixels, cropPixels } from "@/modules/image-resizer/domain/compose";
import type { RenderPlan, RgbaImage } from "@/modules/image-resizer/types";

/** A picture whose every pixel says where it is, so a copy is checkable. */
function gradient(width: number, height: number): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const at = (y * width + x) * 4;

            data[at] = x;
            data[at + 1] = y;
            data[at + 2] = 128;
            data[at + 3] = 255;
        }
    }

    return { width, height, data };
}

function solid(width: number, height: number, rgba: readonly number[]): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let at = 0; at < data.length; at += 4) {
        data.set(rgba, at);
    }

    return { width, height, data };
}

function pixelAt(image: RgbaImage, x: number, y: number): number[] {
    const at = (y * image.width + x) * 4;

    return [...image.data.subarray(at, at + 4)];
}

describe("cropPixels", () => {
    test("copies the exact bytes it selected", () => {
        const source = gradient(10, 10);
        const cropped = cropPixels(source, { x: 3, y: 4, width: 2, height: 2 });

        expect(cropped.width).toBe(2);
        expect(cropped.height).toBe(2);
        expect(pixelAt(cropped, 0, 0)).toEqual([3, 4, 128, 255]);
        expect(pixelAt(cropped, 1, 0)).toEqual([4, 4, 128, 255]);
        expect(pixelAt(cropped, 0, 1)).toEqual([3, 5, 128, 255]);
        expect(pixelAt(cropped, 1, 1)).toEqual([4, 5, 128, 255]);
    });

    test("a full-frame crop is byte-identical to the source", () => {
        const source = gradient(8, 6);
        const cropped = cropPixels(source, { x: 0, y: 0, width: 8, height: 6 });

        expect([...cropped.data]).toEqual([...source.data]);
    });

    test("interpolates nothing — every byte is a byte that was there", () => {
        const source = gradient(16, 16);
        const cropped = cropPixels(source, { x: 5, y: 5, width: 6, height: 6 });

        for (let y = 0; y < 6; y += 1) {
            for (let x = 0; x < 6; x += 1) {
                expect(pixelAt(cropped, x, y)).toEqual(pixelAt(source, x + 5, y + 5));
            }
        }
    });

    test("clips a rectangle that runs past the edge", () => {
        const cropped = cropPixels(gradient(10, 10), { x: 8, y: 8, width: 40, height: 40 });

        expect(cropped.width).toBe(2);
        expect(cropped.height).toBe(2);
    });
});

function plan(patch: Partial<RenderPlan>): RenderPlan {
    return {
        crop: { x: 0, y: 0, width: 4, height: 4 },
        canvas: { width: 4, height: 4 },
        draw: { x: 0, y: 0, width: 4, height: 4 },
        matte: null,
        resamples: false,
        clips: false,
        ...patch,
    };
}

describe("composePixels", () => {
    test("an exact fit is a straight copy", () => {
        const source = gradient(4, 4);
        const composed = composePixels(source, plan({}));

        expect([...composed.data]).toEqual([...source.data]);
    });

    test("contain leaves the background in the letterbox and the picture between", () => {
        const source = solid(4, 2, [10, 20, 30, 255]);
        const composed = composePixels(
            source,
            plan({
                canvas: { width: 4, height: 4 },
                draw: { x: 0, y: 1, width: 4, height: 2 },
                matte: { r: 255, g: 255, b: 255 },
            }),
        );

        expect(pixelAt(composed, 0, 0)).toEqual([255, 255, 255, 255]);
        expect(pixelAt(composed, 0, 1)).toEqual([10, 20, 30, 255]);
        expect(pixelAt(composed, 3, 2)).toEqual([10, 20, 30, 255]);
        expect(pixelAt(composed, 3, 3)).toEqual([255, 255, 255, 255]);
    });

    test("a transparent background leaves the padding transparent", () => {
        const composed = composePixels(
            solid(4, 2, [10, 20, 30, 255]),
            plan({ draw: { x: 0, y: 1, width: 4, height: 2 }, matte: null }),
        );

        expect(pixelAt(composed, 0, 0)).toEqual([0, 0, 0, 0]);
        expect(pixelAt(composed, 0, 1)).toEqual([10, 20, 30, 255]);
    });

    test("cover clips what falls outside instead of wrapping it", () => {
        const source = gradient(8, 4);
        const composed = composePixels(
            source,
            plan({
                canvas: { width: 4, height: 4 },
                draw: { x: -2, y: 0, width: 8, height: 4 },
                clips: true,
            }),
        );

        expect(composed.width).toBe(4);
        // Column 0 of the canvas is column 2 of the source.
        expect(pixelAt(composed, 0, 0)).toEqual([2, 0, 128, 255]);
        expect(pixelAt(composed, 3, 0)).toEqual([5, 0, 128, 255]);
    });

    test("composites a translucent source over the matte", () => {
        const composed = composePixels(
            solid(2, 2, [0, 0, 0, 128]),
            plan({
                canvas: { width: 2, height: 2 },
                draw: { x: 0, y: 0, width: 2, height: 2 },
                matte: { r: 255, g: 255, b: 255 },
            }),
        );

        // 0·(128/255) + 255·(1 − 128/255) = 127, and the result is opaque.
        expect(pixelAt(composed, 0, 0)).toEqual([127, 127, 127, 255]);
    });

    test("keeps a translucent source translucent over no matte", () => {
        const composed = composePixels(
            solid(2, 2, [10, 20, 30, 128]),
            plan({ canvas: { width: 2, height: 2 }, draw: { x: 0, y: 0, width: 2, height: 2 } }),
        );

        expect(pixelAt(composed, 0, 0)).toEqual([10, 20, 30, 128]);
    });
});
