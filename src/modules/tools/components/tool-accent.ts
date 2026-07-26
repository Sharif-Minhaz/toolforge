import type { ToolAccent } from "../types";

/**
 * Each accent exposes itself as `--tool-accent`, so every surface that tints
 * with it (icon tile, glow, ring) can read one variable instead of repeating a
 * five-way class map.
 */
export const TOOL_ACCENT_VARS: Record<ToolAccent, string> = {
    violet: "[--tool-accent:var(--brand-violet)]",
    cyan: "[--tool-accent:var(--brand-cyan)]",
    amber: "[--tool-accent:var(--brand-amber)]",
    rose: "[--tool-accent:var(--brand-rose)]",
    emerald: "[--tool-accent:var(--brand-emerald)]",
};

/** Square icon tile used in cards and nav rows. */
export const TOOL_ICON_TILE =
    "flex shrink-0 items-center justify-center rounded-[0.6rem] bg-[color-mix(in_oklch,var(--tool-accent)_13%,transparent)] text-[var(--tool-accent)] ring-1 ring-[color-mix(in_oklch,var(--tool-accent)_20%,transparent)] ring-inset";
