const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/**
 * Text on its way into markup this site emits.
 *
 * Unconditional, and both quote characters are in the set: a caller writing a
 * text node does not need `'` escaped, but a caller writing an attribute does,
 * and the one who has to remember which is which is the one who eventually gets
 * it wrong. `&#39;` renders as an apostrophe everywhere, so the stricter set
 * costs a correct caller nothing.
 *
 * Not a sanitiser. It escapes text that is *about* to become markup; it has
 * nothing to say about markup that already exists.
 */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}
