import { describe, expect, test } from "bun:test";

import { readOcrProgress, StallError, watchStall } from "../domain/progress";
import { fitWithinPixels } from "../domain/recognize";

describe("readOcrProgress", () => {
    test("recognition is its own phase", () => {
        expect(readOcrProgress({ status: "recognizing text", progress: 0.4 })).toEqual({
            phase: "recognizing",
            ratio: 0.4,
        });
    });

    test("every other status is loading", () => {
        expect(readOcrProgress({ status: "loading language traineddata", progress: 1 })).toEqual({
            phase: "loading",
            ratio: 1,
        });
    });

    test("clamps the ratio", () => {
        expect(readOcrProgress({ status: "recognizing text", progress: 1.2 }).ratio).toBe(1);
        expect(readOcrProgress({ status: "recognizing text", progress: -1 }).ratio).toBe(0);
        expect(readOcrProgress({ status: "recognizing text", progress: Number.NaN }).ratio).toBe(0);
    });
});

describe("watchStall", () => {
    test("passes a result through", async () => {
        expect(await watchStall(50, async () => "done")).toBe("done");
    });

    test("fails work that goes quiet", async () => {
        const never = new Promise<string>(() => undefined);

        await expect(watchStall(20, () => never)).rejects.toBeInstanceOf(StallError);
    });

    test("work that keeps reporting outlives the stall window", async () => {
        const result = await watchStall(30, async (alive) => {
            for (let tick = 0; tick < 4; tick += 1) {
                await new Promise((resolve) => setTimeout(resolve, 15));
                alive();
            }

            return "slow but alive";
        });

        expect(result).toBe("slow but alive");
    });

    test("passes the work's own failure through", async () => {
        await expect(
            watchStall(50, async () => {
                throw new TypeError("boom");
            }),
        ).rejects.toBeInstanceOf(TypeError);
    });
});

describe("fitWithinPixels", () => {
    test("leaves a picture under the ceiling alone", () => {
        expect(fitWithinPixels({ width: 1920, height: 1080 }, 8_300_000)).toEqual({
            width: 1920,
            height: 1080,
        });
    });

    test("scales a larger one down to fit, keeping its proportions", () => {
        const fitted = fitWithinPixels({ width: 8000, height: 6000 }, 8_300_000);

        expect(fitted.width * fitted.height).toBeLessThanOrEqual(8_300_000);
        expect(fitted.width / fitted.height).toBeCloseTo(4 / 3, 2);
        expect(fitted.width).toBeGreaterThan(3300);
    });

    test("never collapses an edge to zero", () => {
        expect(fitWithinPixels({ width: 100_000, height: 1 }, 1000).height).toBe(1);
    });
});
