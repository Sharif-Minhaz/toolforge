import { describe, expect, test } from "bun:test";

import {
    clampBlurStrength,
    defaultChoiceForTab,
    isSameBackground,
    keepsTransparency,
    parseHexColor,
    tabForBackground,
    TRANSPARENT_BACKGROUND,
} from "../domain/background";
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_BLUR_STRENGTH,
    MAX_BLUR_STRENGTH,
    MIN_BLUR_STRENGTH,
} from "../domain/constants";
import type { BackgroundChoice } from "../types";

describe("clampBlurStrength", () => {
    test("keeps a value inside the control's range", () => {
        expect(clampBlurStrength(40)).toBe(40);
    });

    test("clamps to the ends rather than wrapping", () => {
        expect(clampBlurStrength(0)).toBe(MIN_BLUR_STRENGTH);
        expect(clampBlurStrength(500)).toBe(MAX_BLUR_STRENGTH);
    });

    test("rounds, because the slider reports fractions and the label shows a whole number", () => {
        expect(clampBlurStrength(41.6)).toBe(42);
    });

    test("a value that is not a number falls back to the default rather than to NaN", () => {
        expect(clampBlurStrength(Number.NaN)).toBe(DEFAULT_BLUR_STRENGTH);
        expect(clampBlurStrength(Number.POSITIVE_INFINITY)).toBe(DEFAULT_BLUR_STRENGTH);
    });
});

describe("parseHexColor", () => {
    test("accepts six digits with or without the hash", () => {
        expect(parseHexColor("#FF3B30")).toBe("#ff3b30");
        expect(parseHexColor("ff3b30")).toBe("#ff3b30");
    });

    test("expands three-digit shorthand, because a stylesheet paste is still a colour", () => {
        expect(parseHexColor("#fff")).toBe("#ffffff");
        expect(parseHexColor("0a4")).toBe("#00aa44");
    });

    test("trims, so a paste with a trailing newline still works", () => {
        expect(parseHexColor("  #abcdef \n")).toBe("#abcdef");
    });

    test("refuses anything that is not a hex triplet", () => {
        for (const raw of ["red", "rgb(1,2,3)", "#ff", "#fffff", "#fffffff", "#ff3b3g", ""]) {
            expect(parseHexColor(raw)).toBeNull();
        }
    });

    test("refuses eight digits — an alpha channel here would be silently dropped", () => {
        expect(parseHexColor("#ff3b3080")).toBeNull();
    });
});

describe("tabForBackground", () => {
    test("transparent lives in the colour tab, as its first swatch", () => {
        expect(tabForBackground(TRANSPARENT_BACKGROUND)).toBe("color");
    });

    test("each other kind maps to its own tab", () => {
        expect(tabForBackground({ kind: "color", color: "#ffffff" })).toBe("color");
        expect(tabForBackground({ kind: "blur", strength: 40 })).toBe("blur");
        expect(
            tabForBackground({
                kind: "image",
                url: "https://x/y.jpg",
                credit: null,
                description: "",
            }),
        ).toBe("photo");
    });
});

describe("isSameBackground", () => {
    test("two structurally identical choices are the same, whatever their identity", () => {
        expect(
            isSameBackground(
                { kind: "color", color: "#fff000" },
                { kind: "color", color: "#fff000" },
            ),
        ).toBe(true);
    });

    test("a different kind is never the same", () => {
        expect(isSameBackground(TRANSPARENT_BACKGROUND, { kind: "color", color: "#ffffff" })).toBe(
            false,
        );
    });

    test("a nudged blur strength makes the composite stale", () => {
        expect(
            isSameBackground({ kind: "blur", strength: 40 }, { kind: "blur", strength: 41 }),
        ).toBe(false);
    });

    test("a different photograph makes it stale, and the same one does not", () => {
        const one: BackgroundChoice = {
            kind: "image",
            url: "https://images.example/a.jpg",
            credit: null,
            description: "a",
        };
        const two: BackgroundChoice = { ...one, url: "https://images.example/b.jpg" };

        expect(isSameBackground(one, { ...one, description: "changed" })).toBe(true);
        expect(isSameBackground(one, two)).toBe(false);
    });

    test("two transparent choices are always the same", () => {
        expect(isSameBackground(TRANSPARENT_BACKGROUND, { kind: "transparent" })).toBe(true);
    });
});

describe("defaultChoiceForTab", () => {
    test("blur and colour open on something", () => {
        expect(defaultChoiceForTab("blur")).toEqual({
            kind: "blur",
            strength: DEFAULT_BLUR_STRENGTH,
        });
        expect(defaultChoiceForTab("color")).toEqual({
            kind: "color",
            color: DEFAULT_BACKGROUND_COLOR,
        });
    });

    test("the photo tab opens on nothing, rather than picking a stranger's photograph", () => {
        expect(defaultChoiceForTab("photo")).toBeNull();
    });
});

describe("keepsTransparency", () => {
    test("only a transparent background leaves an alpha channel behind", () => {
        expect(keepsTransparency(TRANSPARENT_BACKGROUND)).toBe(true);
        expect(keepsTransparency({ kind: "color", color: "#ffffff" })).toBe(false);
        expect(keepsTransparency({ kind: "blur", strength: 40 })).toBe(false);
    });
});
