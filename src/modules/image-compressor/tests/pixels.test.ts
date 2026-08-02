import { describe, expect, test } from "bun:test";

import { flattenOntoMatte, isOpaque } from "@/modules/image-compressor/domain/pixels";

function pixels(...bytes: number[]) {
    return { data: Uint8ClampedArray.from(bytes) };
}

describe("isOpaque", () => {
    test("an empty buffer counts as opaque", () => {
        expect(isOpaque(pixels())).toBe(true);
    });

    test("full alpha everywhere is opaque", () => {
        expect(isOpaque(pixels(10, 20, 30, 255, 40, 50, 60, 255))).toBe(true);
    });

    test("one fully transparent pixel is enough", () => {
        expect(isOpaque(pixels(10, 20, 30, 255, 40, 50, 60, 0))).toBe(false);
    });

    test("one nearly-opaque pixel is enough", () => {
        expect(isOpaque(pixels(10, 20, 30, 254))).toBe(false);
    });

    test("reads the alpha byte, not the colour bytes", () => {
        // Zero in every colour channel, full alpha: opaque black, not transparent.
        expect(isOpaque(pixels(0, 0, 0, 255))).toBe(true);
    });

    test("finds transparency in the last pixel of a long run", () => {
        const data = new Uint8ClampedArray(4 * 5000).fill(255);
        data[data.length - 1] = 128;

        expect(isOpaque({ data })).toBe(false);
    });
});

describe("flattenOntoMatte", () => {
    test("leaves an opaque pixel exactly as it was", () => {
        expect([...flattenOntoMatte(pixels(12, 34, 56, 255))]).toEqual([12, 34, 56, 255]);
    });

    test("replaces a fully transparent pixel with the matte", () => {
        expect([...flattenOntoMatte(pixels(0, 0, 0, 0))]).toEqual([255, 255, 255, 255]);
    });

    test("blends a half-transparent pixel toward the matte", () => {
        // Alpha 128 is 128/255 = 0.50196, not 0.5, so black over white lands on
        // 255·(1 − 0.50196) = 127.0 rather than the 127.5 the eye expects.
        expect([...flattenOntoMatte(pixels(0, 0, 0, 128))]).toEqual([127, 127, 127, 255]);
    });

    test("honours a matte other than white", () => {
        const black = { r: 0, g: 0, b: 0 };

        expect([...flattenOntoMatte(pixels(255, 255, 255, 0), black)]).toEqual([0, 0, 0, 255]);
    });

    test("always returns opaque pixels", () => {
        const flattened = flattenOntoMatte(pixels(1, 2, 3, 0, 4, 5, 6, 90, 7, 8, 9, 200));

        expect([flattened[3], flattened[7], flattened[11]]).toEqual([255, 255, 255]);
    });

    test("does not mutate its input", () => {
        const source = pixels(10, 20, 30, 0);

        flattenOntoMatte(source);

        expect([...source.data]).toEqual([10, 20, 30, 0]);
    });

    test("handles an empty buffer", () => {
        expect(flattenOntoMatte(pixels()).length).toBe(0);
    });
});
