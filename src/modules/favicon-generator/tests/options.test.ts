import { describe, expect, test } from "bun:test";

import { DEFAULT_OPTIONS, MAX_TEXT_LENGTH } from "@/modules/favicon-generator/domain/constants";
import { canvasFont, fontStack } from "@/modules/favicon-generator/domain/fonts";
import {
    checkFaviconOptions,
    hasVisibleText,
    manifestExtras,
    maskableApplies,
    resolveAppName,
} from "@/modules/favicon-generator/domain/options";
import { initialOptionsFrom } from "@/modules/favicon-generator/validation/search-params";

describe("hasVisibleText", () => {
    test("accepts letters, Bangla and emoji", () => {
        for (const text of ["A", "TF", "ক্ষ", "অ", "🚀", "👨‍👩‍👧‍👦", "🇧🇩"]) {
            expect(hasVisibleText(text)).toBe(true);
        }
    });

    test("refuses text with nothing to draw", () => {
        // Spaces, a no-break space, ZWJ, a variation selector, a soft hyphen.
        for (const text of ["", "   ", " ", "‍", "️", "­", "\t\n"]) {
            expect(hasVisibleText(text)).toBe(false);
        }
    });

    test("the longest emoji in common use fits the field's ceiling", () => {
        expect("👨‍👩‍👧‍👦".length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    });
});

describe("checkFaviconOptions", () => {
    test("the defaults draw", () => {
        expect(checkFaviconOptions(DEFAULT_OPTIONS)).toEqual([]);
    });

    test("names every bad field at once, in field order", () => {
        expect(
            checkFaviconOptions({
                ...DEFAULT_OPTIONS,
                text: " ",
                foreground: "#fff",
                background: "blue",
            }),
        ).toEqual(["empty_text", "invalid_foreground", "invalid_background"]);
    });

    test("a half-typed background is not a complaint while it is not used", () => {
        expect(
            checkFaviconOptions({ ...DEFAULT_OPTIONS, background: "#12", transparent: true }),
        ).toEqual([]);
    });
});

describe("maskableApplies", () => {
    test("needs both the switch and an opaque background", () => {
        expect(maskableApplies({ maskable: true, transparent: false })).toBe(true);
        expect(maskableApplies({ maskable: true, transparent: true })).toBe(false);
        expect(maskableApplies({ maskable: false, transparent: false })).toBe(false);
    });
});

describe("resolveAppName", () => {
    test("falls back to the text, trimmed", () => {
        expect(resolveAppName({ appName: "  ", text: " TF " })).toBe("TF");
        expect(resolveAppName({ appName: " ToolForge ", text: "TF" })).toBe("ToolForge");
    });
});

describe("manifestExtras", () => {
    test("an opaque icon lends its background to both manifest colours", () => {
        expect(manifestExtras({ ...DEFAULT_OPTIONS, background: "#4F46E5" })).toEqual({
            themeColor: "#4f46e5",
            backgroundColor: "#4f46e5",
            maskable: false,
        });
    });

    test("a transparent icon claims no colour and no maskable pair", () => {
        expect(manifestExtras({ ...DEFAULT_OPTIONS, transparent: true, maskable: true })).toEqual(
            {},
        );
    });
});

describe("fontStack", () => {
    const variables: Record<string, string> = {
        "--font-inter": " '__Inter_a1', '__Inter_Fallback_a1' ",
        "--font-bengali": "'__Noto_b2'",
        "--font-jetbrains-mono": "'__JetBrains_c3'",
    };
    const read = (name: string) => variables[name] ?? "";

    test("resolves the next/font variables into real family names, Bangla behind Latin", () => {
        expect(fontStack("sans", read)).toBe(
            "'__Inter_a1', '__Inter_Fallback_a1', '__Noto_b2', ui-sans-serif, system-ui, sans-serif",
        );
        expect(fontStack("mono", read)).toBe(
            "'__JetBrains_c3', ui-monospace, SFMono-Regular, monospace",
        );
    });

    test("serif is the system's own", () => {
        expect(fontStack("serif", read)).toBe("serif");
    });

    test("an unset variable drops out instead of leaving an empty family", () => {
        expect(fontStack("sans", () => "")).toBe("ui-sans-serif, system-ui, sans-serif");
    });

    test("builds a canvas font shorthand", () => {
        expect(canvasFont("serif", true, 12.5)).toBe("700 12.5px serif");
        expect(canvasFont("serif", false, 200)).toBe("400 200px serif");
    });
});

describe("initialOptionsFrom", () => {
    test("opens on what a link names", () => {
        expect(initialOptionsFrom({ text: "TF", fg: "#FFFFFF", bg: "#111827" })).toEqual({
            ...DEFAULT_OPTIONS,
            text: "TF",
            foreground: "#ffffff",
            background: "#111827",
        });
    });

    test("one malformed field falls back on its own", () => {
        const options = initialOptionsFrom({
            text: "x".repeat(MAX_TEXT_LENGTH + 1),
            fg: "red",
            bg: "#000000",
        });

        expect(options.text).toBe(DEFAULT_OPTIONS.text);
        expect(options.foreground).toBe(DEFAULT_OPTIONS.foreground);
        expect(options.background).toBe("#000000");
    });

    test("a repeated or blank parameter is ignored", () => {
        expect(initialOptionsFrom({ text: ["a", "b"], bg: "" })).toEqual(DEFAULT_OPTIONS);
        expect(initialOptionsFrom({ text: "   " }).text).toBe(DEFAULT_OPTIONS.text);
    });
});
