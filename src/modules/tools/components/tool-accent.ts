import type { ToolAccent } from "../types";

/**
 * Every tool reads one accent — the brand indigo — through `--tool-accent`.
 * A hue per tool turned the sidebar and every card grid into a rainbow where
 * nothing led; the accent now marks only selection and the one action that
 * matters. The map stays keyed by `ToolAccent` so callers need not change.
 */
export const TOOL_ACCENT_VARS: Record<ToolAccent, string> = {
    violet: "[--tool-accent:var(--primary)]",
    cyan: "[--tool-accent:var(--primary)]",
    amber: "[--tool-accent:var(--primary)]",
    rose: "[--tool-accent:var(--primary)]",
    emerald: "[--tool-accent:var(--primary)]",
};

/**
 * Hues that tell categories apart where the colour carries meaning — the node
 * kinds on the mock-server graph canvas. Never for chrome.
 */
export const CATEGORY_HUE_VARS: Record<ToolAccent, string> = {
    violet: "[--tool-accent:var(--brand-violet)]",
    cyan: "[--tool-accent:var(--brand-cyan)]",
    amber: "[--tool-accent:var(--brand-amber)]",
    rose: "[--tool-accent:var(--brand-rose)]",
    emerald: "[--tool-accent:var(--brand-emerald)]",
};

/** Square icon tile used in cards and nav rows: neutral, in the muted text role. */
export const TOOL_ICON_TILE =
    "flex shrink-0 items-center justify-center rounded-[0.6rem] bg-muted text-muted-foreground ring-1 ring-border ring-inset";

/**
 * Icon plate on the home page's cards, cut like a keycap: a neutral face, a
 * hairline edge with a heavier bottom lip, and a top highlight on desktop. The
 * glyph is the foreground colour; callers turn it `--primary` on hover. One
 * plate for every tool — a hue per tool read as noise rather than meaning.
 */
export const KEYCAP_ICON =
    "flex shrink-0 items-center justify-center rounded-[10px] border border-b-2 border-border bg-muted/70 text-foreground transition-colors duration-150 md:panel-sheen";
