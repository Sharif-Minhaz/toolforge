import { describe, expect, test } from "bun:test";

import {
    applyRatio,
    centeredCrop,
    clampCrop,
    fullCrop,
    isFullCrop,
    moveCrop,
    resizeCropTo,
} from "@/modules/image-resizer/domain/crop";
import type { CropRect } from "@/modules/image-resizer/types";

const BOUNDS = { width: 1000, height: 800 };

function rect(x: number, y: number, width: number, height: number): CropRect {
    return { x, y, width, height };
}

describe("fullCrop", () => {
    test("selects the whole picture", () => {
        expect(fullCrop(BOUNDS)).toEqual(rect(0, 0, 1000, 800));
        expect(isFullCrop(fullCrop(BOUNDS), BOUNDS)).toBe(true);
    });

    test("stops recognising itself once anything is taken off", () => {
        expect(isFullCrop(rect(1, 0, 999, 800), BOUNDS)).toBe(false);
    });
});

describe("clampCrop", () => {
    test("leaves a legal rectangle alone", () => {
        expect(clampCrop(rect(10, 20, 300, 400), BOUNDS)).toEqual(rect(10, 20, 300, 400));
    });

    test("rounds to whole pixels", () => {
        expect(clampCrop(rect(10.4, 20.6, 300.5, 399.4), BOUNDS)).toEqual(rect(10, 21, 301, 399));
    });

    test("narrows a box wider than the picture instead of pushing it off the edge", () => {
        expect(clampCrop(rect(0, 0, 5000, 5000), BOUNDS)).toEqual(rect(0, 0, 1000, 800));
    });

    test("pulls a box back inside", () => {
        expect(clampCrop(rect(900, 700, 300, 300), BOUNDS)).toEqual(rect(700, 500, 300, 300));
    });

    test("refuses a negative origin", () => {
        expect(clampCrop(rect(-50, -50, 200, 200), BOUNDS)).toEqual(rect(0, 0, 200, 200));
    });

    test("never produces a zero-sized crop", () => {
        const clamped = clampCrop(rect(10, 10, 0, 0), BOUNDS);

        expect(clamped.width).toBeGreaterThanOrEqual(1);
        expect(clamped.height).toBeGreaterThanOrEqual(1);
    });
});

describe("moveCrop", () => {
    test("drags the box without changing its size", () => {
        expect(moveCrop(rect(100, 100, 200, 200), 50, -30, BOUNDS)).toEqual(
            rect(150, 70, 200, 200),
        );
    });

    test("stops at the edge rather than shrinking against it", () => {
        const moved = moveCrop(rect(900, 700, 100, 100), 500, 500, BOUNDS);

        expect(moved).toEqual(rect(900, 700, 100, 100));
    });
});

describe("resizeCropTo — free", () => {
    test("drags the south-east corner and leaves the north-west one alone", () => {
        expect(
            resizeCropTo(rect(100, 100, 200, 200), "se", { x: 500, y: 400 }, BOUNDS, null),
        ).toEqual(rect(100, 100, 400, 300));
    });

    test("drags the north-west corner and leaves the south-east one alone", () => {
        expect(
            resizeCropTo(rect(100, 100, 200, 200), "nw", { x: 50, y: 60 }, BOUNDS, null),
        ).toEqual(rect(50, 60, 250, 240));
    });

    test("an edge handle changes one axis only", () => {
        expect(
            resizeCropTo(rect(100, 100, 200, 200), "e", { x: 500, y: 9999 }, BOUNDS, null),
        ).toEqual(rect(100, 100, 400, 200));
        expect(
            resizeCropTo(rect(100, 100, 200, 200), "n", { x: -50, y: 40 }, BOUNDS, null),
        ).toEqual(rect(100, 40, 200, 260));
    });

    test("does not flip when the pointer crosses the anchor", () => {
        // A crop that turns inside out under the cursor is a novelty, not a
        // feature: the box collapses to the minimum and stays put.
        const dragged = resizeCropTo(
            rect(100, 100, 200, 200),
            "se",
            { x: 20, y: 20 },
            BOUNDS,
            null,
        );

        expect(dragged.x).toBe(100);
        expect(dragged.y).toBe(100);
        expect(dragged.width).toBeGreaterThanOrEqual(1);
        expect(dragged.height).toBeGreaterThanOrEqual(1);
    });

    test("stops at the picture's edge", () => {
        expect(
            resizeCropTo(rect(100, 100, 200, 200), "se", { x: 5000, y: 5000 }, BOUNDS, null),
        ).toEqual(rect(100, 100, 900, 700));
    });
});

describe("resizeCropTo — ratio locked", () => {
    test("keeps a square square whichever axis was dragged further", () => {
        const dragged = resizeCropTo(rect(0, 0, 100, 100), "se", { x: 400, y: 250 }, BOUNDS, 1);

        expect(dragged.width).toBe(dragged.height);
        // Follows the pointer outward rather than lagging behind the shorter
        // axis, so the box reaches 400 rather than stopping at 250.
        expect(dragged.width).toBe(400);
    });

    test("keeps 16:9 while dragging a corner", () => {
        const dragged = resizeCropTo(rect(0, 0, 160, 90), "se", { x: 320, y: 400 }, BOUNDS, 16 / 9);

        expect(dragged.width / dragged.height).toBeCloseTo(16 / 9, 2);
    });

    test("an edge handle grows the other axis symmetrically", () => {
        // Dragging the north edge of a centred box widens it about its own
        // centre, so the box stays where the reader put it.
        const start = rect(400, 300, 200, 200);
        const dragged = resizeCropTo(start, "n", { x: 0, y: 200 }, BOUNDS, 1);
        const centre = dragged.x + dragged.width / 2;

        expect(dragged.width).toBe(dragged.height);
        expect(centre).toBeCloseTo(500, 0);
    });

    test("shrinks rather than breaking the ratio at the edge of the picture", () => {
        // The bug this exists to stop: clamping each axis on its own satisfies
        // the bounds and quietly abandons the lock, at the exact moment the
        // reader was relying on it.
        const dragged = resizeCropTo(
            rect(900, 700, 100, 100),
            "se",
            { x: 5000, y: 5000 },
            BOUNDS,
            1,
        );

        expect(dragged.width).toBe(dragged.height);
        expect(dragged.x + dragged.width).toBeLessThanOrEqual(BOUNDS.width);
        expect(dragged.y + dragged.height).toBeLessThanOrEqual(BOUNDS.height);
    });

    test("stays inside the picture on every handle", () => {
        for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const) {
            const dragged = resizeCropTo(
                rect(300, 300, 200, 200),
                handle,
                { x: 100_000, y: -100_000 },
                BOUNDS,
                4 / 3,
            );

            expect(dragged.x).toBeGreaterThanOrEqual(0);
            expect(dragged.y).toBeGreaterThanOrEqual(0);
            expect(dragged.x + dragged.width).toBeLessThanOrEqual(BOUNDS.width);
            expect(dragged.y + dragged.height).toBeLessThanOrEqual(BOUNDS.height);
        }
    });
});

describe("centeredCrop", () => {
    test("selects everything when nothing is locked", () => {
        expect(centeredCrop(BOUNDS, null)).toEqual(fullCrop(BOUNDS));
    });

    test("takes the largest square, centred", () => {
        expect(centeredCrop(BOUNDS, 1)).toEqual(rect(100, 0, 800, 800));
    });

    test("takes the largest 16:9 box, centred", () => {
        const crop = centeredCrop(BOUNDS, 16 / 9);

        expect(crop.width).toBe(1000);
        expect(crop.height).toBe(563);
        expect(crop.x).toBe(0);
        expect(crop.y).toBe(119);
    });

    test("the passport shape is taller than it is wide", () => {
        const crop = centeredCrop(BOUNDS, 45 / 55);

        expect(crop.height).toBe(800);
        expect(crop.width).toBe(655);
    });
});

describe("applyRatio", () => {
    test("keeps the area and the centre", () => {
        // 400 × 200 is 80 000 square pixels, and the square of that area is
        // 283 on a side — an odd number, so the centre lands on a half pixel.
        const reshaped = applyRatio(rect(100, 100, 400, 200), 1, BOUNDS);

        expect(reshaped.width).toBe(283);
        expect(reshaped.height).toBe(283);
        expect(Math.abs(reshaped.x + reshaped.width / 2 - 300)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(reshaped.y + reshaped.height / 2 - 200)).toBeLessThanOrEqual(0.5);
    });

    test("every shape derived from one reference round-trips exactly", () => {
        // The reported bug, and the shape of the fix. The island keeps the box
        // the reader last *dragged* and derives each ratio from that, never from
        // the shape the previous switch produced — so 1:1, then 4:3, then 1:1
        // lands back on the same square rather than on a smaller one.
        const anchor = fullCrop(BOUNDS);
        const first = applyRatio(anchor, 1, BOUNDS);

        for (const ratio of [4 / 3, 16 / 9, 3 / 2, 45 / 55, 9 / 16]) {
            applyRatio(anchor, ratio, BOUNDS);

            expect(applyRatio(anchor, 1, BOUNDS)).toEqual(first);
        }
    });

    test("and chaining without one converges instead of collapsing", () => {
        // Defence in depth. Area is lost whenever a shape meets the edge of the
        // picture and cannot keep it, so chaining is not free — but it settles
        // rather than ratcheting, which is what the inscribing version did.
        const square = applyRatio(fullCrop(BOUNDS), 1, BOUNDS);
        const ratios = [4 / 3, 1, 16 / 9, 3 / 2, 1];

        let crop = square;

        for (let pass = 0; pass < 10; pass += 1) {
            for (const ratio of ratios) {
                crop = applyRatio(crop, ratio, BOUNDS);
            }
        }

        expect(crop.width).toBe(crop.height);
        expect(crop.width).toBeGreaterThan(square.width * 0.9);
    });

    test("takes the largest box of the shape from a full-frame selection", () => {
        // What somebody who has not dragged anything yet expects: 1:1 over a
        // 1000 × 800 picture is the 800 × 800 square, not something smaller.
        expect(applyRatio(fullCrop(BOUNDS), 1, BOUNDS)).toEqual(rect(100, 0, 800, 800));
    });

    test("leaves the box alone when the lock is released", () => {
        expect(applyRatio(rect(100, 100, 400, 200), null, BOUNDS)).toEqual(
            rect(100, 100, 400, 200),
        );
    });

    test("slides a box near the edge back inside rather than shrinking it", () => {
        // Anchoring the centre and shrinking would punish a crop for being near
        // a margin; the area is what the reader chose, so the box moves.
        const reshaped = applyRatio(rect(0, 200, 200, 400), 1, BOUNDS);

        expect(reshaped.width).toBe(283);
        expect(reshaped.x).toBe(0);
    });

    test("keeps the result inside the picture", () => {
        const reshaped = applyRatio(rect(0, 700, 1000, 100), 1, BOUNDS);

        expect(reshaped.x).toBeGreaterThanOrEqual(0);
        expect(reshaped.y).toBeGreaterThanOrEqual(0);
        expect(reshaped.x + reshaped.width).toBeLessThanOrEqual(BOUNDS.width);
        expect(reshaped.y + reshaped.height).toBeLessThanOrEqual(BOUNDS.height);
    });
});
