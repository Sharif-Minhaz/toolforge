import { describe, expect, test } from "bun:test";

import {
    MAX_PREVIEW_HEIGHT_PX,
    MAX_PREVIEW_HEIGHT_SVH,
    previewFrameMaxWidth,
} from "@/modules/tools/domain/preview-frame";

describe("previewFrameMaxWidth", () => {
    test("caps a square preview at the height ceiling", () => {
        expect(previewFrameMaxWidth({ width: 1000, height: 1000 })).toBe(
            `calc(1 * min(${MAX_PREVIEW_HEIGHT_PX}px, ${MAX_PREVIEW_HEIGHT_SVH}svh))`,
        );
    });

    test("narrows a phone screenshot rather than letting it run down the page", () => {
        // 1170 × 2532 is an iPhone screenshot: at full column width it renders
        // more than two viewports tall.
        const aspect = 1170 / 2532;

        expect(previewFrameMaxWidth({ width: 1170, height: 2532 })).toBe(
            `calc(${aspect} * min(${MAX_PREVIEW_HEIGHT_PX}px, ${MAX_PREVIEW_HEIGHT_SVH}svh))`,
        );
        expect(aspect).toBeLessThan(0.5);
    });

    test("leaves a wide picture alone by giving it a ceiling wider than its column", () => {
        const value = previewFrameMaxWidth({ width: 4000, height: 1000 });

        expect(value.startsWith("calc(4 *")).toBe(true);
    });

    test("takes an explicit ceiling", () => {
        expect(previewFrameMaxWidth({ width: 2, height: 1 }, 300, 50)).toBe(
            "calc(2 * min(300px, 50svh))",
        );
    });

    test("treats a degenerate size as square rather than dividing by zero", () => {
        expect(previewFrameMaxWidth({ width: 100, height: 0 })).toContain("calc(1 *");
        expect(previewFrameMaxWidth({ width: 0, height: 100 })).toContain("calc(1 *");
    });
});
