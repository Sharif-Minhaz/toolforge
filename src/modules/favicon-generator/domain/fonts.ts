import type { FaviconFont } from "../types";

/**
 * A canvas does not read CSS variables: `ctx.font = "var(--font-inter)"` is an
 * invalid font string and silently leaves the previous one in place. next/font
 * hashes its family names, so the only way to the real name is the variable's
 * computed value — read by the caller and handed in here.
 *
 * The stacks mirror `--font-sans` and `--font-mono` in `globals.css`, so the
 * glyph is drawn in what the page shows: Inter, falling through to Noto Sans
 * Bengali for Bangla, then the system. Emoji fall through to the system emoji
 * font in every stack, which is why they differ by device.
 */
const FONT_VARIABLES: Record<FaviconFont, readonly string[]> = {
    sans: ["--font-inter", "--font-bengali"],
    mono: ["--font-jetbrains-mono"],
    serif: [],
};

const GENERIC_FALLBACK: Record<FaviconFont, string> = {
    sans: "ui-sans-serif, system-ui, sans-serif",
    mono: "ui-monospace, SFMono-Regular, monospace",
    // The site ships no serif; this one is the device's own.
    serif: "serif",
};

export function fontStack(font: FaviconFont, readVariable: (name: string) => string): string {
    const own = FONT_VARIABLES[font]
        .map((name) => readVariable(name).trim())
        .filter((family) => family !== "");

    return [...own, GENERIC_FALLBACK[font]].join(", ");
}

/** A `ctx.font` shorthand. */
export function canvasFont(stack: string, bold: boolean, size: number): string {
    return `${bold ? 700 : 400} ${size}px ${stack}`;
}
