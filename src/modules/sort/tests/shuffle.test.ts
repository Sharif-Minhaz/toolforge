import { describe, expect, test } from "bun:test";

import { drawShuffleSeed, shuffleWithSeed } from "@/modules/sort/domain/shuffle";

const ITEMS = Array.from({ length: 24 }, (_, index) => String(index));

describe("shuffleWithSeed", () => {
    /**
     * The property the whole hydration story rests on: the same seed gives the
     * same arrangement, in every runtime, for ever. If this ever fails, the
     * server pass and the browser pass stop agreeing.
     */
    test("gives one arrangement per seed", () => {
        expect(shuffleWithSeed(ITEMS, 42)).toEqual(shuffleWithSeed(ITEMS, 42));
        expect(shuffleWithSeed(ITEMS, 42)).not.toEqual(shuffleWithSeed(ITEMS, 43));
    });

    test("keeps every item, exactly once", () => {
        expect([...shuffleWithSeed(ITEMS, 9)].sort()).toEqual([...ITEMS].sort());
    });

    test("does not touch the array it was given", () => {
        const original = [...ITEMS];
        shuffleWithSeed(ITEMS, 3);

        expect(ITEMS).toEqual(original);
    });

    test("handles the sizes where a shuffle has nothing to do", () => {
        expect(shuffleWithSeed([], 1)).toEqual([]);
        expect(shuffleWithSeed(["only"], 1)).toEqual(["only"]);
    });

    /**
     * Not a uniformity proof — a chi-squared test on a seeded generator is a
     * test of the generator, not of this code. What it does check is that the
     * arrangement actually varies with the seed rather than settling into a
     * handful of shapes, which is how a broken swap index shows up.
     */
    test("reaches many different arrangements across seeds", () => {
        const seen = new Set(
            Array.from({ length: 200 }, (_, seed) => shuffleWithSeed(ITEMS, seed).join(",")),
        );

        expect(seen.size).toBe(200);
    });
});

describe("drawShuffleSeed", () => {
    test("reads four bytes as one unsigned 32-bit number", () => {
        expect(drawShuffleSeed(() => new Uint8Array([0, 0, 0, 1]))).toBe(1);
        expect(drawShuffleSeed(() => new Uint8Array([255, 255, 255, 255]))).toBe(4_294_967_295);
        expect(drawShuffleSeed(() => new Uint8Array([1, 0, 0, 0]))).toBe(16_777_216);
    });
});
