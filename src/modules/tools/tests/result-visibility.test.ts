import { describe, expect, test } from "bun:test";

import { decideResultScroll, TALL_RESULT_COVERAGE } from "@/modules/tools/domain/result-visibility";

const VIEWPORT = 800;

function box(top: number, height: number) {
    return { top, bottom: top + height };
}

describe("decideResultScroll", () => {
    test("leaves a result that fits and is wholly on screen", () => {
        expect(decideResultScroll(box(120, 400), VIEWPORT)).toBe("leave");
        expect(decideResultScroll(box(0, VIEWPORT), VIEWPORT)).toBe("leave");
    });

    test("scrolls a result that fits but is partly under the fold", () => {
        // The case the old 40% rule waved through: a scan's progress panel
        // with its top half on screen and the rest below it.
        expect(decideResultScroll(box(600, 340), VIEWPORT)).toBe("scroll");
        expect(decideResultScroll(box(780, 100), VIEWPORT)).toBe("scroll");
    });

    test("scrolls a result entirely below or above the viewport", () => {
        expect(decideResultScroll(box(1_200, 300), VIEWPORT)).toBe("scroll");
        expect(decideResultScroll(box(-900, 300), VIEWPORT)).toBe("scroll");
    });

    test("scrolls a result that fits but has scrolled partly off the top", () => {
        expect(decideResultScroll(box(-50, 300), VIEWPORT)).toBe("scroll");
    });

    test("leaves a tall result that already covers most of the screen", () => {
        // The reader is inside it; moving the page would lose their place.
        expect(decideResultScroll(box(-2_000, 4_000), VIEWPORT)).toBe("leave");
        expect(decideResultScroll(box(100, 3_000), VIEWPORT)).toBe("leave");
        expect(
            decideResultScroll(box(VIEWPORT * (1 - TALL_RESULT_COVERAGE), 3_000), VIEWPORT),
        ).toBe("leave");
    });

    test("scrolls a tall result whose top sits low on the screen", () => {
        expect(decideResultScroll(box(500, 3_000), VIEWPORT)).toBe("scroll");
        expect(decideResultScroll(box(VIEWPORT + 10, 3_000), VIEWPORT)).toBe("scroll");
    });

    test("scrolls a tall result scrolled almost out of view above", () => {
        expect(decideResultScroll(box(-2_900, 3_000), VIEWPORT)).toBe("scroll");
    });

    test("waits on an empty box rather than scrolling to a gap", () => {
        expect(decideResultScroll(box(300, 0), VIEWPORT)).toBe("wait");
        expect(decideResultScroll({ top: 300, bottom: 200 }, VIEWPORT)).toBe("wait");
    });

    test("leaves the page alone when there is no viewport to measure", () => {
        expect(decideResultScroll(box(300, 200), 0)).toBe("leave");
    });
});
