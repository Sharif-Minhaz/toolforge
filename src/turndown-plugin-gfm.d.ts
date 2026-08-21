/**
 * `@joplin/turndown-plugin-gfm` ships no types of its own.
 *
 * It is the maintained fork of Turndown's own GFM plugin — same four rules,
 * still published, no dependencies — and the rules are what let an HTML table
 * survive the trip to Markdown at all. The shape below is the whole public
 * surface: five functions, each one a `TurndownService.Plugin`.
 *
 * Ambient rather than an augmentation, which is why this file has no top-level
 * import: a `declare module` inside a module file augments an existing
 * declaration, and there is none to augment.
 */
declare module "@joplin/turndown-plugin-gfm" {
    import type TurndownService from "turndown";

    /** Every rule below, applied at once. */
    export const gfm: TurndownService.Plugin;
    export const highlightedCodeBlock: TurndownService.Plugin;
    export const strikethrough: TurndownService.Plugin;
    export const tables: TurndownService.Plugin;
    export const taskListItems: TurndownService.Plugin;
}
