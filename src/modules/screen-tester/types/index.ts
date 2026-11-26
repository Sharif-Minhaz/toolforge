/**
 * The screens the test steps through, in order. A literal tuple so message
 * keys such as `screenTester.patterns.red.name` stay statically checkable.
 */
export const SCREEN_PATTERNS = [
    "black",
    "white",
    "red",
    "green",
    "blue",
    "grey",
    "custom",
    "gradient",
    "checker",
] as const;

export type ScreenPattern = (typeof SCREEN_PATTERNS)[number];

/** The patterns that are one flat colour fixed by the tool. */
export type SolidPattern = Exclude<ScreenPattern, "custom" | "gradient" | "checker">;

/**
 * How a running test covers the screen. `fullscreen` is the Fullscreen API;
 * the other two fill the window instead and say why — the browser has no
 * Fullscreen API (iPhone Safari), or it refused the request.
 */
export type ScreenDisplay = "fullscreen" | "unsupported" | "refused";

export type ScreenStep = "next" | "previous";
