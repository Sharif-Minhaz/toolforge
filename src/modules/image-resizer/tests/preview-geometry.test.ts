import { describe, expect, test } from "bun:test";

import { DEFAULT_OPTIONS } from "@/modules/image-resizer/domain/constants";
import { planRender } from "@/modules/image-resizer/domain/plan";
import { previewLayout } from "@/modules/image-resizer/domain/preview-geometry";
import type { CropRect, ResizeOptions } from "@/modules/image-resizer/types";

const SOURCE = { width: 1000, height: 500 };
const FULL: CropRect = { x: 0, y: 0, width: 1000, height: 500 };

function options(patch: Partial<ResizeOptions> = {}): ResizeOptions {
    return { ...DEFAULT_OPTIONS, ...patch };
}

describe("previewLayout", () => {
    test("an untouched picture fills its canvas exactly", () => {
        const layout = previewLayout(SOURCE, planRender(FULL, options({ mode: "percentage" })));

        expect(layout.canvasAspect).toBe("1000 / 500");
        expect(layout.draw).toEqual({ left: "0%", top: "0%", width: "100%", height: "100%" });
        expect(layout.image).toEqual({ left: "0%", top: "0%", width: "100%", height: "100%" });
    });

    test("a scale changes the canvas and nothing else — the picture still fills it", () => {
        const layout = previewLayout(
            SOURCE,
            planRender(FULL, options({ mode: "percentage", percentage: 50 })),
        );

        expect(layout.canvasAspect).toBe("500 / 250");
        expect(layout.draw.width).toBe("100%");
    });

    test("contain letterboxes: the draw box is inset and the canvas shows through", () => {
        const layout = previewLayout(
            SOURCE,
            planRender(
                FULL,
                options({
                    mode: "dimensions",
                    width: 400,
                    height: 400,
                    lockAspect: false,
                    fit: "contain",
                }),
            ),
        );

        expect(layout.canvasAspect).toBe("400 / 400");
        expect(layout.draw).toEqual({ left: "0%", top: "25%", width: "100%", height: "50%" });
    });

    test("cover overflows the canvas, which clips it", () => {
        const layout = previewLayout(
            SOURCE,
            planRender(
                FULL,
                options({
                    mode: "dimensions",
                    width: 400,
                    height: 400,
                    lockAspect: false,
                    fit: "cover",
                }),
            ),
        );

        expect(layout.draw.left).toBe("-50%");
        expect(layout.draw.width).toBe("200%");
    });

    test("a crop blows the picture up inside the draw box and offsets it", () => {
        // The right-hand quarter of the picture: the image is twice the draw
        // box's width and pulled left by its own full width.
        const crop: CropRect = { x: 500, y: 0, width: 500, height: 500 };
        const layout = previewLayout(SOURCE, planRender(crop, options({ mode: "percentage" })));

        expect(layout.canvasAspect).toBe("500 / 500");
        expect(layout.image).toEqual({
            left: "-100%",
            top: "0%",
            width: "200%",
            height: "100%",
        });
    });

    test("a centred crop pulls the picture up and left by the right amounts", () => {
        const crop: CropRect = { x: 250, y: 125, width: 500, height: 250 };
        const layout = previewLayout(SOURCE, planRender(crop, options({ mode: "percentage" })));

        expect(layout.image).toEqual({
            left: "-50%",
            top: "-50%",
            width: "200%",
            height: "200%",
        });
    });

    test("never divides by zero on a degenerate plan", () => {
        const layout = previewLayout(
            { width: 0, height: 0 },
            planRender({ x: 0, y: 0, width: 0, height: 0 }, options()),
        );

        expect(layout.canvasAspect).toBe("1 / 1");
        expect(Number.isNaN(Number.parseFloat(layout.image.width))).toBe(false);
    });
});
