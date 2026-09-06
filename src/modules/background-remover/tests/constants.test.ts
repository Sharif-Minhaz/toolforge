import { describe, expect, test } from "bun:test";

import { MAX_SEGMENTATION_SIDE } from "@/modules/tools/domain/segmentation";

import { MAX_BLUR_RENDER_SIDE, MAX_COMPOSITE_SIDE } from "../domain/constants";

/**
 * The three size ceilings, and the relationships between them.
 *
 * `MAX_SEGMENTATION_SIDE` moved to the shared layer with the model it belongs
 * to; the other two are this tool's alone. What is asserted here is how they sit
 * against each other, which is a fact about compositing rather than about
 * segmentation — so it stayed behind when the model driver left.
 */
describe("the size ceilings", () => {
    test("segmentation runs at the model's own input size, and no larger", () => {
        // Anything above 1024 is scaled to 1024 × 1024 by the library before
        // inference — in a JavaScript bilinear loop on the main thread — and the
        // mask is scaled back the same way. Feeding it more bought nothing at
        // the boundary and cost several times the main-thread work.
        expect(MAX_SEGMENTATION_SIDE).toBe(1024);
    });

    test("the composite ceiling is well above the segmentation one", () => {
        // The subject's own pixels come from the original, not from the
        // segmentation copy, so the output is allowed to be much larger than the
        // mask that shaped it.
        expect(MAX_COMPOSITE_SIDE).toBeGreaterThan(MAX_SEGMENTATION_SIDE);
    });

    test("the blur canvas is far smaller than the composite it is scaled onto", () => {
        // A blur destroys the detail a bigger canvas would carry, so rendering
        // it small and scaling up is free. If these ever converged, the saving
        // would be gone and the tab would freeze again.
        expect(MAX_BLUR_RENDER_SIDE).toBeLessThan(MAX_COMPOSITE_SIDE / 2);
    });

    test("two composite canvases stay inside a sane memory budget", () => {
        // Four bytes a pixel, two canvases live at once, up to five open slots.
        // This is the arithmetic that took a reader's machine down when the
        // ceiling did not exist; keep it honest.
        const pixels = MAX_COMPOSITE_SIDE * MAX_COMPOSITE_SIDE;
        const bytesPerComposite = pixels * 4 * 2;

        expect(bytesPerComposite).toBeLessThan(64 * 1024 * 1024);
    });
});
