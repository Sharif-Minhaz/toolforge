/**
 * Whether a keystroke landed somewhere text is being typed.
 *
 * The guard every canvas shortcut needs and the one hand-rolled ones forget:
 * `Delete` pressed with the cursor in the inspector's name field must delete a
 * character, not the node being renamed, and `[` must be a bracket rather than a
 * command. The canvas and the studio around it both bind keys at the window, so
 * the rule lives here rather than twice — and being a pure predicate over a tag
 * name it is testable without a DOM, which is the point.
 *
 * A `<select>` counts. It takes no text, but it does take letter keys to jump to
 * an option, and a shortcut that steals those makes a long list unusable.
 */
export const TYPING_TAG_NAMES: ReadonlySet<string> = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTypingTarget(tagName: string | null, isContentEditable = false): boolean {
    if (isContentEditable) {
        return true;
    }

    return tagName !== null && TYPING_TAG_NAMES.has(tagName.toUpperCase());
}

/**
 * The two panel shortcuts, as a mnemonic rather than as a modifier chord.
 *
 * Brackets point at the rail each one opens, and neither has a browser default
 * to fight — unlike every obvious alternative. `Ctrl+B` opens Firefox's
 * bookmarks sidebar, `Ctrl+Shift+I` opens devtools and cannot be prevented at
 * all, and `⌘[` is Back on macOS. A bare key is also the canvas convention:
 * Figma and Excalidraw both reach for unmodified letters, which is only safe
 * because of `isTypingTarget` above.
 */
export const PALETTE_SHORTCUT = "[";

export const INSPECTOR_SHORTCUT = "]";
