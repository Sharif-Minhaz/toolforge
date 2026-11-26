import { describe, expect, test } from "bun:test";

import {
    DEFAULT_CUSTOM_COLOUR,
    keyStep,
    patternBackground,
    SOLID_COLOURS,
    stepPattern,
} from "../domain/patterns";
import { SCREEN_PATTERNS } from "../types";

describe("stepPattern", () => {
    test("moves one screen either way", () => {
        expect(stepPattern(2, "next")).toBe(3);
        expect(stepPattern(2, "previous")).toBe(1);
    });

    test("wraps past the last screen to the first, and back", () => {
        const last = SCREEN_PATTERNS.length - 1;

        expect(stepPattern(last, "next")).toBe(0);
        expect(stepPattern(0, "previous")).toBe(last);
    });

    test("visits every screen once in a full lap", () => {
        let index = 0;
        const seen = new Set<number>();

        for (let lap = 0; lap < SCREEN_PATTERNS.length; lap += 1) {
            seen.add(index);
            index = stepPattern(index, "next");
        }

        expect(seen.size).toBe(SCREEN_PATTERNS.length);
        expect(index).toBe(0);
    });
});

describe("patternBackground", () => {
    test("paints the primaries at full intensity and grey at the midpoint", () => {
        expect(patternBackground("black", DEFAULT_CUSTOM_COLOUR)).toBe("#000000");
        expect(patternBackground("white", DEFAULT_CUSTOM_COLOUR)).toBe("#ffffff");
        expect(patternBackground("red", DEFAULT_CUSTOM_COLOUR)).toBe("#ff0000");
        expect(patternBackground("green", DEFAULT_CUSTOM_COLOUR)).toBe("#00ff00");
        expect(patternBackground("blue", DEFAULT_CUSTOM_COLOUR)).toBe("#0000ff");
        expect(patternBackground("grey", DEFAULT_CUSTOM_COLOUR)).toBe("#808080");
    });

    test("paints the reader's own colour for the custom screen", () => {
        expect(patternBackground("custom", "#123456")).toBe("#123456");
    });

    test("runs the gradient from black to white", () => {
        expect(patternBackground("gradient", DEFAULT_CUSTOM_COLOUR)).toBe(
            "linear-gradient(to right, #000000, #ffffff)",
        );
    });

    test("leaves the checkerboard to the canvas", () => {
        expect(patternBackground("checker", DEFAULT_CUSTOM_COLOUR)).toBeNull();
    });

    test("covers every solid pattern in the sequence", () => {
        const solids = SCREEN_PATTERNS.filter(
            (pattern) => pattern !== "custom" && pattern !== "gradient" && pattern !== "checker",
        );

        expect(Object.keys(SOLID_COLOURS).sort()).toEqual([...solids].sort());
    });
});

describe("keyStep", () => {
    test("arrows, Space, Enter and Page Down go forward", () => {
        for (const key of ["ArrowRight", "ArrowDown", " ", "Enter", "PageDown"]) {
            expect(keyStep(key)).toBe("next");
        }
    });

    test("arrows, Page Up and Backspace go back", () => {
        for (const key of ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"]) {
            expect(keyStep(key)).toBe("previous");
        }
    });

    test("leaves Escape, Tab and letters alone", () => {
        for (const key of ["Escape", "Tab", "a", "Shift"]) {
            expect(keyStep(key)).toBeNull();
        }
    });
});
