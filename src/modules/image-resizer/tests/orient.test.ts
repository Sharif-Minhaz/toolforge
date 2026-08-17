import { describe, expect, test } from "bun:test";

import {
    flipPixels,
    normalizeAngle,
    quarterTurnsFor,
    rotatedSize,
    rotatePixels,
    rotateQuarterTurns,
} from "@/modules/image-resizer/domain/orient";
import type { RgbaImage } from "@/modules/image-resizer/types";

/** A picture whose every pixel says where it came from, so a permutation is checkable. */
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

function pixelAt(image: RgbaImage, x: number, y: number): number[] {
    const at = (y * image.width + x) * 4;

    return [...image.data.subarray(at, at + 4)];
}

/** Every byte of the output, sorted, so a permutation can be told from a resample. */
function multiset(image: RgbaImage): number[] {
    return [...image.data].sort((left, right) => left - right);
}

describe("normalizeAngle", () => {
    test("folds a full turn away", () => {
        expect(normalizeAngle(360)).toBe(0);
        expect(normalizeAngle(-360)).toBe(0);
        expect(normalizeAngle(450)).toBe(90);
    });

    test("prefers the short way round", () => {
        expect(normalizeAngle(350)).toBe(-10);
        expect(normalizeAngle(270)).toBe(-90);
    });

    test("keeps the half turn positive, so 180 is not -180", () => {
        expect(normalizeAngle(180)).toBe(180);
        expect(normalizeAngle(-180)).toBe(180);
    });

    test("a value that is not a number is no rotation at all", () => {
        expect(normalizeAngle(Number.NaN)).toBe(0);
        expect(normalizeAngle(Number.POSITIVE_INFINITY)).toBe(0);
    });
});

describe("quarterTurnsFor", () => {
    test("recognises every exact quarter turn, however it was typed", () => {
        expect(quarterTurnsFor(0)).toBe(0);
        expect(quarterTurnsFor(90)).toBe(1);
        expect(quarterTurnsFor(180)).toBe(2);
        expect(quarterTurnsFor(-90)).toBe(3);
        expect(quarterTurnsFor(270)).toBe(3);
        expect(quarterTurnsFor(-270)).toBe(1);
    });

    test("refuses anything in between, so it never claims an exact path it cannot take", () => {
        expect(quarterTurnsFor(1)).toBeNull();
        expect(quarterTurnsFor(89.5)).toBeNull();
        expect(quarterTurnsFor(-45)).toBeNull();
    });
});

describe("rotateQuarterTurns", () => {
    test("a quarter turn clockwise swaps the axes and moves the top-left to the top-right", () => {
        const rotated = rotateQuarterTurns(gradient(4, 3), 1);

        expect(rotated.width).toBe(3);
        expect(rotated.height).toBe(4);
        // Source (0,0) is the top-left; a clockwise turn puts it on the right edge.
        expect(pixelAt(rotated, 2, 0)).toEqual([0, 0, 128, 255]);
        expect(pixelAt(rotated, 0, 0)).toEqual([0, 2, 128, 255]);
        expect(pixelAt(rotated, 2, 3)).toEqual([3, 0, 128, 255]);
    });

    test("a quarter turn anticlockwise puts the top-left on the bottom-left", () => {
        const rotated = rotateQuarterTurns(gradient(4, 3), 3);

        expect(rotated.width).toBe(3);
        expect(rotated.height).toBe(4);
        expect(pixelAt(rotated, 0, 3)).toEqual([0, 0, 128, 255]);
    });

    test("a half turn keeps the shape and reverses both axes", () => {
        const rotated = rotateQuarterTurns(gradient(4, 3), 2);

        expect(rotated.width).toBe(4);
        expect(rotated.height).toBe(3);
        expect(pixelAt(rotated, 3, 2)).toEqual([0, 0, 128, 255]);
        expect(pixelAt(rotated, 0, 0)).toEqual([3, 2, 128, 255]);
    });

    test("interpolates nothing — the bytes out are the bytes in, moved", () => {
        const source = gradient(7, 5);

        expect(multiset(rotateQuarterTurns(source, 1))).toEqual(multiset(source));
        expect(multiset(rotateQuarterTurns(source, 3))).toEqual(multiset(source));
    });

    test("four turns is the picture again, byte for byte", () => {
        const source = gradient(7, 5);
        const round = rotateQuarterTurns(
            rotateQuarterTurns(rotateQuarterTurns(rotateQuarterTurns(source, 1), 1), 1),
            1,
        );

        expect(round.width).toBe(source.width);
        expect(round.height).toBe(source.height);
        expect([...round.data]).toEqual([...source.data]);
    });

    test("a turn and its opposite cancel", () => {
        const source = gradient(6, 4);

        expect([...rotateQuarterTurns(rotateQuarterTurns(source, 1), 3).data]).toEqual([
            ...source.data,
        ]);
    });

    test("no turn is no work", () => {
        const source = gradient(3, 2);

        expect(rotateQuarterTurns(source, 0)).toBe(source);
        expect(rotateQuarterTurns(source, 4)).toBe(source);
    });
});

describe("flipPixels", () => {
    test("horizontal swaps left and right and leaves the rows where they were", () => {
        const flipped = flipPixels(gradient(4, 3), "horizontal");

        expect(flipped.width).toBe(4);
        expect(flipped.height).toBe(3);
        expect(pixelAt(flipped, 0, 1)).toEqual([3, 1, 128, 255]);
        expect(pixelAt(flipped, 3, 1)).toEqual([0, 1, 128, 255]);
    });

    test("vertical swaps top and bottom and leaves the columns where they were", () => {
        const flipped = flipPixels(gradient(4, 3), "vertical");

        expect(pixelAt(flipped, 1, 0)).toEqual([1, 2, 128, 255]);
        expect(pixelAt(flipped, 1, 2)).toEqual([1, 0, 128, 255]);
    });

    test("either mirror twice is the picture again, byte for byte", () => {
        const source = gradient(5, 4);

        expect([...flipPixels(flipPixels(source, "horizontal"), "horizontal").data]).toEqual([
            ...source.data,
        ]);
        expect([...flipPixels(flipPixels(source, "vertical"), "vertical").data]).toEqual([
            ...source.data,
        ]);
    });

    test("both mirrors together are a half turn", () => {
        const source = gradient(5, 4);

        expect([...flipPixels(flipPixels(source, "horizontal"), "vertical").data]).toEqual([
            ...rotateQuarterTurns(source, 2).data,
        ]);
    });

    test("interpolates nothing", () => {
        const source = gradient(7, 5);

        expect(multiset(flipPixels(source, "horizontal"))).toEqual(multiset(source));
    });
});

describe("rotatedSize", () => {
    test("a quarter turn swaps the sides exactly", () => {
        expect(rotatedSize({ width: 400, height: 300 }, 90)).toEqual({ width: 300, height: 400 });
        expect(rotatedSize({ width: 400, height: 300 }, -90)).toEqual({ width: 300, height: 400 });
    });

    test("a half turn changes nothing", () => {
        expect(rotatedSize({ width: 400, height: 300 }, 180)).toEqual({ width: 400, height: 300 });
    });

    test("45° needs the diagonal, rounded up so no corner is cut", () => {
        // 100·cos45 + 100·sin45 = 141.42…, and 141 would clip the corners.
        expect(rotatedSize({ width: 100, height: 100 }, 45)).toEqual({ width: 142, height: 142 });
    });

    test("never returns an empty box", () => {
        expect(rotatedSize({ width: 1, height: 1 }, 33)).toEqual({ width: 2, height: 2 });
    });
});

describe("rotatePixels", () => {
    test("an exact quarter turn takes the exact path, not a bilinear approximation", () => {
        const source = gradient(6, 4);

        expect([...rotatePixels(source, 90).data]).toEqual([...rotateQuarterTurns(source, 1).data]);
        expect([...rotatePixels(source, -90).data]).toEqual([
            ...rotateQuarterTurns(source, 3).data,
        ]);
        expect([...rotatePixels(source, 180).data]).toEqual([
            ...rotateQuarterTurns(source, 2).data,
        ]);
        expect(rotatePixels(source, 360)).toBe(source);
    });

    test("grows the canvas to fit the corners", () => {
        const rotated = rotatePixels(gradient(100, 100), 45);

        expect(rotated.width).toBe(142);
        expect(rotated.height).toBe(142);
    });

    test("the new corners are transparent rather than a colour nobody chose", () => {
        const rotated = rotatePixels(gradient(40, 40), 45);

        expect(pixelAt(rotated, 0, 0)[3]).toBe(0);
        expect(pixelAt(rotated, rotated.width - 1, rotated.height - 1)[3]).toBe(0);
    });

    test("the middle of the picture stays opaque and keeps its colour", () => {
        const solid = {
            width: 40,
            height: 40,
            data: new Uint8ClampedArray(40 * 40 * 4).fill(0),
        };

        for (let at = 0; at < solid.data.length; at += 4) {
            solid.data.set([200, 100, 50, 255], at);
        }

        const rotated = rotatePixels(solid, 30);
        const centre = pixelAt(
            rotated,
            Math.floor(rotated.width / 2),
            Math.floor(rotated.height / 2),
        );

        expect(centre).toEqual([200, 100, 50, 255]);
    });

    /**
     * The premultiplied-sampling check. A transparent hole beside an opaque
     * red: averaging the two unpremultiplied would drag black out of the hole
     * and darken the red, which is invisible until somebody turns a logo.
     */
    test("a transparent neighbour lightens the alpha without staining the colour", () => {
        const data = new Uint8ClampedArray(2 * 1 * 4);

        data.set([255, 0, 0, 255], 0);
        // Transparent, and deliberately carrying a colour a naive average would leak.
        data.set([0, 255, 0, 0], 4);

        const rotated = rotatePixels({ width: 2, height: 1, data }, 20);

        for (let at = 0; at < rotated.data.length; at += 4) {
            if (rotated.data[at + 3] === 0) {
                continue;
            }

            expect(rotated.data[at]).toBe(255);
            expect(rotated.data[at + 1]).toBe(0);
            expect(rotated.data[at + 2]).toBe(0);
        }
    });

    test("a free angle and its opposite return roughly the picture, which is the cost of a resample", () => {
        const source = gradient(60, 40);
        const round = rotatePixels(rotatePixels(source, 15), -15);

        // Same shape back, because the second box is computed from the first.
        expect(round.width).toBeGreaterThanOrEqual(source.width);
        expect(round.height).toBeGreaterThanOrEqual(source.height);

        const insetX = Math.floor((round.width - source.width) / 2);
        const insetY = Math.floor((round.height - source.height) / 2);
        const middle = pixelAt(round, insetX + 30, insetY + 20);

        // Within a couple of levels of the source pixel, not equal to it — a
        // free angle is lossy and the tool says so.
        expect(Math.abs(middle[0] - 30)).toBeLessThanOrEqual(3);
        expect(Math.abs(middle[1] - 20)).toBeLessThanOrEqual(3);
    });
});
