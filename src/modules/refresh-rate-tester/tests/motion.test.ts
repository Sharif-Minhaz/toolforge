import { describe, expect, test } from "bun:test";

import { blockOffset, stepPerFrame } from "@/modules/refresh-rate-tester/domain/motion";

describe("blockOffset", () => {
    test("enters from the left edge and leaves by the right", () => {
        expect(blockOffset(0, 300, 40)).toBe(-40);
        expect(blockOffset(170, 300, 40)).toBe(130);
        expect(blockOffset(339, 300, 40)).toBe(299);
    });

    test("starts the next pass once the block has left", () => {
        expect(blockOffset(340, 300, 40)).toBe(-40);
        expect(blockOffset(340 * 5 + 10, 300, 40)).toBe(-30);
    });
});

describe("stepPerFrame", () => {
    test("is the speed shared out over the refreshes", () => {
        expect(stepPerFrame(960, 60)).toBe(16);
        expect(stepPerFrame(960, 240)).toBe(4);
        expect(stepPerFrame(960, 144)).toBeCloseTo(6.667, 3);
    });
});
