import { SCREEN_PATTERNS, type ScreenPattern, type ScreenStep, type SolidPattern } from "../types";

/*
 * Raw colour literals, deliberately. These are the test's output — the exact
 * values the panel is asked to show — not themed chrome, so a design token
 * that shifts with light and dark would make the test wrong.
 */
export const SOLID_COLOURS: Readonly<Record<SolidPattern, string>> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#00ff00",
    blue: "#0000ff",
    grey: "#808080",
};

/** Yellow: red and green sub-pixels lit together, which no fixed screen shows. */
export const DEFAULT_CUSTOM_COLOUR = "#ffff00";

const GRADIENT = "linear-gradient(to right, #000000, #ffffff)";

/**
 * A small preview of the checkerboard for a swatch. The full-screen one is
 * drawn on a canvas at device pixels instead: a CSS checker is laid out in CSS
 * pixels and blurs into grey on any display that scales.
 */
export const CHECKER_PREVIEW =
    "repeating-conic-gradient(#000000 0% 25%, #ffffff 0% 50%) 0 0 / 4px 4px";

/** Hide the cursor and fade the on-screen legend after this long without input. */
export const IDLE_MS = 2500;

/**
 * The CSS background that paints a pattern, or `null` for the checkerboard,
 * which needs a canvas to land on device pixels.
 */
export function patternBackground(pattern: ScreenPattern, customColour: string): string | null {
    switch (pattern) {
        case "custom":
            return customColour;
        case "gradient":
            return GRADIENT;
        case "checker":
            return null;
        default:
            return SOLID_COLOURS[pattern];
    }
}

/** Moves through the sequence, wrapping at both ends. */
export function stepPattern(index: number, step: ScreenStep): number {
    const count = SCREEN_PATTERNS.length;

    return (((index + (step === "next" ? 1 : -1)) % count) + count) % count;
}

/**
 * What a key does during the test. Escape is not here: the browser takes it
 * to leave full screen, and the dialog takes it in the window fallback.
 */
export function keyStep(key: string): ScreenStep | null {
    switch (key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
            return "next";
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
            return "previous";
        default:
            return null;
    }
}
