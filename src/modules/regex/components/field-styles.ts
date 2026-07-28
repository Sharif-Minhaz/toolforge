/**
 * The metrics an overlay and the textarea beneath it must agree on.
 *
 * Both fields in this tool pair a textarea with a painted copy of the same
 * text. They stay aligned only while every property that decides where a glyph
 * lands is identical — family, size, line height, tracking, padding, and
 * wrapping. Sharing the strings is what stops one side drifting when the other
 * is restyled.
 *
 * The two fields divide the work differently, and it matters which way round:
 *
 * - The **pattern** needs a colour per token, which a textarea cannot do. Its
 *   ink is transparent and the overlay paints every character.
 * - The **test string** only needs a highlight behind whole matches. There the
 *   textarea keeps its own visible text — real selection, real caret, real
 *   text for a screen reader — and the overlay contributes nothing but the
 *   backgrounds it sits behind.
 */
export const FIELD_TEXT = "font-mono text-[0.8125rem] leading-6 tracking-normal [tab-size:4]";

export const FIELD_PADDING = "px-3 py-2.5";

/** The painted layer, under the textarea in both cases. */
export const FIELD_OVERLAY = "pointer-events-none absolute inset-0 overflow-hidden";

/** Shared textarea reset. Ordering puts it above the overlay without a z-index. */
export const FIELD_INPUT = "relative w-full bg-transparent outline-none";

/** Added when the overlay owns the ink, as it does for the pattern. */
export const FIELD_INPUT_TRANSPARENT = "caret-foreground text-transparent";
