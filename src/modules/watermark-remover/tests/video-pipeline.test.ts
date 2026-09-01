import { describe, expect, test } from "bun:test";

import { DETECT_SAMPLE_COUNT } from "@/modules/watermark-remover/domain/video-constants";
import { sampleTimestamps } from "@/modules/watermark-remover/domain/video-pipeline";

/**
 * Only the timestamp plan is reachable here. Everything else in the pipeline
 * needs `VideoDecoder`, `VideoEncoder` and a canvas, none of which `bun test`
 * has — the arithmetic those stages run on is tested on its own in
 * `glyph-mask.test.ts` and `inpaint.test.ts`.
 */
describe("sampleTimestamps", () => {
    test("spreads the asked-for number of probes across the clip", () => {
        const stamps = sampleTimestamps(8, DETECT_SAMPLE_COUNT);
        const step = 8 / DETECT_SAMPLE_COUNT;

        // Derived from the constant rather than written out, so raising the
        // sample count stays a decision about detection rather than a failing
        // test about arithmetic.
        expect(stamps).toHaveLength(DETECT_SAMPLE_COUNT);
        expect(stamps[0]).toBeCloseTo(step / 2, 6);
        expect(stamps.at(-1)).toBeCloseTo(8 - step / 2, 6);
    });

    test("never lands on the first or last instant, where a clip is often fading", () => {
        for (const stamp of sampleTimestamps(10, 8)) {
            expect(stamp).toBeGreaterThan(0);
            expect(stamp).toBeLessThan(10);
        }
    });

    test("is monotonic, which is what makes the decoder read each packet once", () => {
        const stamps = sampleTimestamps(12, 20);

        for (let index = 1; index < stamps.length; index += 1) {
            expect(stamps[index]).toBeGreaterThan(stamps[index - 1] ?? 0);
        }
    });

    test("degrades to a single probe rather than an empty plan", () => {
        expect(sampleTimestamps(0, 8)).toEqual([0]);
        expect(sampleTimestamps(-1, 8)).toEqual([0]);
        expect(sampleTimestamps(Number.NaN, 8)).toEqual([0]);
        expect(sampleTimestamps(8, 0)).toEqual([0]);
    });
});
