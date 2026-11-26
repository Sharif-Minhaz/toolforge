import { describe, expect, test } from "bun:test";

import {
    BARE_GLYPH_FILL,
    CIRCLE_GLYPH_FILL,
    DEFAULT_OPTIONS,
    MASKABLE_SAFE_ZONE,
    PLATE_GLYPH_FILL,
} from "@/modules/favicon-generator/domain/constants";
import { fitGlyph, planIcon, planPack } from "@/modules/favicon-generator/domain/layout";
import type { IconPlan, InkBox } from "@/modules/favicon-generator/types";
import { FAVICON_ICO_SIZES, FAVICON_PNGS } from "@/modules/tools/domain/favicon";

const opaque = { shape: "rounded", transparent: false, maskable: false } as const;

/** The ink's edges once drawn at `layout`, from a box measured at `measuredAt`. */
function drawnInk(ink: InkBox, measuredAt: number, plan: IconPlan) {
    const layout = fitGlyph(ink, measuredAt, plan);

    if (layout === null) {
        throw new Error("expected a layout");
    }

    const scale = layout.fontSize / measuredAt;

    return {
        left: layout.x - ink.left * scale,
        right: layout.x + ink.right * scale,
        top: layout.y - ink.ascent * scale,
        bottom: layout.y + ink.descent * scale,
    };
}

describe("fitGlyph", () => {
    const squarePlan: IconPlan = { size: 100, plate: "square", zone: { kind: "square", side: 80 } };

    test("centres the ink box, not the baseline or the advance", () => {
        // A Bangla-like glyph: ink hanging well above the baseline, offset right.
        const ink: InkBox = { left: -12, right: 90, ascent: 140, descent: 10 };
        const box = drawnInk(ink, 200, squarePlan);

        expect((box.left + box.right) / 2).toBeCloseTo(50, 9);
        expect((box.top + box.bottom) / 2).toBeCloseTo(50, 9);
    });

    test("an emoji-like box that dips below the baseline is centred too", () => {
        const ink: InkBox = { left: 0, right: 180, ascent: 150, descent: 40 };
        const box = drawnInk(ink, 200, squarePlan);

        expect((box.top + box.bottom) / 2).toBeCloseTo(50, 9);
        expect((box.left + box.right) / 2).toBeCloseTo(50, 9);
    });

    test("fits the longer side of the ink to the square zone", () => {
        const wide = drawnInk({ left: 0, right: 400, ascent: 100, descent: 0 }, 200, squarePlan);
        const tall = drawnInk({ left: 0, right: 50, ascent: 300, descent: 100 }, 200, squarePlan);

        expect(wide.right - wide.left).toBeCloseTo(80, 9);
        expect(wide.bottom - wide.top).toBeLessThan(80);
        expect(tall.bottom - tall.top).toBeCloseTo(80, 9);
        expect(tall.right - tall.left).toBeLessThan(80);
    });

    test("fits the ink's diagonal to a circle zone", () => {
        const plan: IconPlan = {
            size: 100,
            plate: "square",
            zone: { kind: "circle", diameter: 80 },
        };
        const box = drawnInk({ left: 0, right: 120, ascent: 90, descent: 0 }, 200, plan);

        expect(Math.hypot(box.right - box.left, box.bottom - box.top)).toBeCloseTo(80, 9);
    });

    test("does not depend on the size the ink was measured at", () => {
        const at100 = fitGlyph({ left: 1, right: 50, ascent: 70, descent: 5 }, 100, squarePlan);
        const at200 = fitGlyph({ left: 2, right: 100, ascent: 140, descent: 10 }, 200, squarePlan);

        expect(at100?.fontSize).toBeCloseTo(at200?.fontSize ?? Number.NaN, 9);
        expect(at100?.x).toBeCloseTo(at200?.x ?? Number.NaN, 9);
        expect(at100?.y).toBeCloseTo(at200?.y ?? Number.NaN, 9);
    });

    test("refuses ink with no area rather than dividing by zero", () => {
        expect(fitGlyph({ left: 0, right: 0, ascent: 0, descent: 0 }, 200, squarePlan)).toBeNull();
        expect(fitGlyph({ left: 0, right: 40, ascent: 0, descent: 0 }, 200, squarePlan)).toBeNull();
        expect(
            fitGlyph({ left: 5, right: -5, ascent: 10, descent: 0 }, 200, squarePlan),
        ).toBeNull();
    });
});

describe("planIcon", () => {
    test("a shaped plate keeps the glyph clear of its edge", () => {
        expect(planIcon("icon", 32, { ...opaque, shape: "square" })).toEqual({
            size: 32,
            plate: "square",
            zone: { kind: "square", side: 32 * PLATE_GLYPH_FILL },
        });
        expect(planIcon("icon", 32, { ...opaque, shape: "circle" }).zone).toEqual({
            kind: "circle",
            diameter: 32 * CIRCLE_GLYPH_FILL,
        });
    });

    test("the apple icon is a full-bleed square whatever the shape", () => {
        for (const shape of ["square", "rounded", "circle"] as const) {
            expect(planIcon("apple", 180, { ...opaque, shape }).plate).toBe("square");
        }
    });

    test("a maskable icon keeps its glyph inside the W3C safe zone", () => {
        expect(planIcon("maskable", 512, opaque)).toEqual({
            size: 512,
            plate: "square",
            // A circle of radius 40% of the edge.
            zone: { kind: "circle", diameter: 512 * 0.8 },
        });
        expect(MASKABLE_SAFE_ZONE).toBe(0.8);
    });

    test("with no background there is no plate, for any purpose", () => {
        for (const purpose of ["icon", "apple"] as const) {
            expect(planIcon(purpose, 48, { ...opaque, transparent: true })).toEqual({
                size: 48,
                plate: "none",
                zone: { kind: "square", side: 48 * BARE_GLYPH_FILL },
            });
        }
    });
});

describe("planPack", () => {
    test("draws every ico size and every pack PNG at its own size", () => {
        const plan = planPack(DEFAULT_OPTIONS);

        expect(plan.ico.map((icon) => icon.size)).toEqual([...FAVICON_ICO_SIZES]);
        expect(plan.pngs.map((png) => [png.name, png.plan.size])).toEqual(
            FAVICON_PNGS.map((png) => [png.name, png.size]),
        );
    });

    test("the shape reaches the ico, the tab PNG and the manifest pair, not the apple icon", () => {
        const plan = planPack({ ...opaque, shape: "circle" });

        expect(plan.ico.every((icon) => icon.plate === "circle")).toBe(true);
        expect(Object.fromEntries(plan.pngs.map((png) => [png.name, png.plan.plate]))).toEqual({
            "favicon-96x96.png": "circle",
            "apple-touch-icon.png": "square",
            "web-app-manifest-192x192.png": "circle",
            "web-app-manifest-512x512.png": "circle",
        });
    });

    test("adds the maskable pair only when asked and only on an opaque background", () => {
        const names = (options: { maskable?: boolean; transparent?: boolean }) =>
            planPack({ ...opaque, ...options }).pngs.map((png) => png.name);

        expect(names({})).not.toContain("maskable-icon-512x512.png");
        expect(names({ maskable: true })).toEqual([
            ...FAVICON_PNGS.map((png) => png.name),
            "maskable-icon-192x192.png",
            "maskable-icon-512x512.png",
        ]);
        expect(names({ maskable: true, transparent: true })).not.toContain(
            "maskable-icon-192x192.png",
        );
    });
});
