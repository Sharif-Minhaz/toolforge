import { describe, expect, test } from "bun:test";

import {
    iconLayout,
    isUpscale,
    padToSquare,
    type SourcePixels,
} from "@/modules/image-converter/domain/icon-layout";
import { BLACK_MATTE, WHITE_MATTE } from "@/modules/tools/domain/pixels";
import { ICON_SIZES } from "@/modules/image-converter/types";

/** A solid block of one colour, so a blit landing in the wrong place is visible. */
function block(width: number, height: number, r: number, g: number, b: number): SourcePixels {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let index = 0; index < data.length; index += 4) {
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = 255;
    }

    return { data, width, height };
}

function pixelAt(square: Uint8ClampedArray, size: number, x: number, y: number): number[] {
    const at = (y * size + x) * 4;

    return [...square.subarray(at, at + 4)];
}

describe("iconLayout", () => {
    test("a square source fills the square exactly", () => {
        expect(iconLayout({ width: 512, height: 512 }, 32)).toEqual({
            size: 32,
            width: 32,
            height: 32,
            offsetX: 0,
            offsetY: 0,
        });
    });

    test("a landscape source is letterboxed top and bottom", () => {
        const layout = iconLayout({ width: 400, height: 200 }, 32);

        expect(layout).toEqual({ size: 32, width: 32, height: 16, offsetX: 0, offsetY: 8 });
    });

    test("a portrait source is pillarboxed left and right", () => {
        const layout = iconLayout({ width: 200, height: 400 }, 32);

        expect(layout).toEqual({ size: 32, width: 16, height: 32, offsetX: 8, offsetY: 0 });
    });

    test("never exceeds the square, even when rounding wants to", () => {
        for (const size of ICON_SIZES) {
            for (const [width, height] of [
                [101, 100],
                [100, 101],
                [999, 998],
                [3, 2],
            ] as const) {
                const layout = iconLayout({ width, height }, size);

                expect(layout.width).toBeLessThanOrEqual(size);
                expect(layout.height).toBeLessThanOrEqual(size);
                expect(layout.offsetX + layout.width).toBeLessThanOrEqual(size);
                expect(layout.offsetY + layout.height).toBeLessThanOrEqual(size);
            }
        }
    });

    test("keeps at least one pixel on an extreme panorama", () => {
        const layout = iconLayout({ width: 20000, height: 3 }, 16);

        expect(layout.width).toBe(16);
        expect(layout.height).toBe(1);
    });

    test("floors the offset, so a spare pixel falls bottom right", () => {
        // 3:2 into 16 gives 16×11, leaving five rows to split between two edges.
        const layout = iconLayout({ width: 300, height: 200 }, 16);

        expect(layout.height).toBe(11);
        expect(layout.offsetY).toBe(2);
    });

    test("upscales rather than refusing a size the source cannot fill", () => {
        expect(iconLayout({ width: 8, height: 8 }, 256)).toEqual({
            size: 256,
            width: 256,
            height: 256,
            offsetX: 0,
            offsetY: 0,
        });
    });

    test("survives a source with no pixels", () => {
        expect(iconLayout({ width: 0, height: 0 }, 32).size).toBe(32);
    });
});

describe("isUpscale", () => {
    test("is true only when the square is larger than the longest edge", () => {
        expect(isUpscale({ width: 100, height: 40 }, 128)).toBe(true);
        expect(isUpscale({ width: 100, height: 40 }, 100)).toBe(false);
        expect(isUpscale({ width: 100, height: 40 }, 64)).toBe(false);
    });
});

describe("padToSquare", () => {
    test("produces a square buffer of the layout's size", () => {
        const layout = iconLayout({ width: 32, height: 16 }, 32);

        expect(padToSquare(block(32, 16, 1, 2, 3), layout, null).length).toBe(32 * 32 * 4);
    });

    test("leaves the margin fully transparent when there is no fill", () => {
        const layout = iconLayout({ width: 32, height: 16 }, 32);
        const square = padToSquare(block(32, 16, 10, 20, 30), layout, null);

        expect(pixelAt(square, 32, 0, 0)).toEqual([0, 0, 0, 0]);
        expect(pixelAt(square, 32, 0, 31)).toEqual([0, 0, 0, 0]);
    });

    test("fills the margin at full alpha when there is a colour", () => {
        const layout = iconLayout({ width: 32, height: 16 }, 32);
        const square = padToSquare(block(32, 16, 10, 20, 30), layout, WHITE_MATTE);

        expect(pixelAt(square, 32, 0, 0)).toEqual([255, 255, 255, 255]);
        expect(pixelAt(square, 32, 31, 31)).toEqual([255, 255, 255, 255]);
    });

    test("lands the picture at the offset the layout named", () => {
        const layout = iconLayout({ width: 32, height: 16 }, 32);
        const square = padToSquare(block(32, 16, 10, 20, 30), layout, BLACK_MATTE);

        expect(layout.offsetY).toBe(8);
        expect(pixelAt(square, 32, 0, 7)).toEqual([0, 0, 0, 255]);
        expect(pixelAt(square, 32, 0, 8)).toEqual([10, 20, 30, 255]);
        expect(pixelAt(square, 32, 0, 23)).toEqual([10, 20, 30, 255]);
        expect(pixelAt(square, 32, 0, 24)).toEqual([0, 0, 0, 255]);
    });

    test("does not wrap a row into the next one", () => {
        const layout = iconLayout({ width: 16, height: 32 }, 32);
        const square = padToSquare(block(16, 32, 99, 99, 99), layout, null);

        expect(layout.offsetX).toBe(8);
        // The column just left of the picture must still be margin, which a
        // row written at the wrong stride would have overwritten.
        expect(pixelAt(square, 32, 7, 0)).toEqual([0, 0, 0, 0]);
        expect(pixelAt(square, 32, 8, 0)).toEqual([99, 99, 99, 255]);
        expect(pixelAt(square, 32, 23, 0)).toEqual([99, 99, 99, 255]);
        expect(pixelAt(square, 32, 24, 0)).toEqual([0, 0, 0, 0]);
    });

    test("a square source covers every pixel, leaving no margin at all", () => {
        const layout = iconLayout({ width: 16, height: 16 }, 16);
        const square = padToSquare(block(16, 16, 5, 6, 7), layout, null);

        for (let index = 0; index < square.length; index += 4) {
            expect(square[index + 3]).toBe(255);
        }
    });

    test("does not mutate its source", () => {
        const source = block(4, 2, 1, 2, 3);
        const before = [...source.data];

        padToSquare(source, iconLayout(source, 8), WHITE_MATTE);

        expect([...source.data]).toEqual(before);
    });
});
