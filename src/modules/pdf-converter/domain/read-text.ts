import type { DocBlock, InlineRun } from "../types";
import { dropEmptyBlocks } from "./blocks";

/**
 * Plain text in, blocks out.
 *
 * The shortest reader here, and the one with the most opinions per line —
 * because a `.txt` file has no markup, every decision about what its bytes mean
 * is the converter's rather than the author's. Three of them are worth stating.
 *
 * **Nothing is parsed.** A `#` at the start of a line is a hash, `*` is an
 * asterisk, `_word_` is an underscore either side of a word. Running plain text
 * through the Markdown reader would have been one line of code and would
 * silently restructure somebody's notes — a shopping list written with `*`
 * becomes a bulleted list, a comment block becomes a heading. Plain text means
 * what it says, so it gets its own format rather than a parser with the safety
 * off.
 *
 * **Line breaks are kept.** A `.txt` is hard-wrapped by whoever wrote it, and
 * those breaks are the only layout it has: an address block, a signature, a
 * poem, an indented outline. Re-flowing the lines into justified paragraphs
 * reads better on the two files that were prose and destroys every other one.
 *
 * **A blank line is a paragraph break.** Which is the one convention every
 * plain-text file in existence actually follows, and the only reason the
 * output has spacing at all.
 */

export type TextReadResult = {
    readonly blocks: readonly DocBlock[];
    /** The first non-blank line, when the file opens with something title-shaped. */
    readonly title: string | null;
};

/**
 * How long a first line may be and still be a title.
 *
 * A `.txt` has no heading syntax, so the only signal is the shape of the file:
 * a short first line followed by a blank one is a title in every README,
 * licence and letter ever written. Past this length it is simply the first
 * sentence of a paragraph, and naming the PDF after half a sentence is worse
 * than naming it after the file.
 */
const MAX_TITLE_LENGTH = 80;

/** `\r\n` and a lone `\r` both mean the same break as `\n`. */
function normalizeNewlines(text: string): string {
    return text.replace(/\r\n?/g, "\n");
}

function toRuns(lines: readonly string[]): readonly InlineRun[] {
    // One run holding the newlines, rather than one run per line. The renderer
    // draws `\n` as a break inside a paragraph, and a run per line would be a
    // measurement per line for no difference in the output.
    return [{ text: lines.join("\n"), preserveSpaces: true }];
}

export function readText(source: string): TextReadResult {
    const normalized = normalizeNewlines(source);
    const blocks: DocBlock[] = [];

    let paragraph: string[] = [];

    const flush = () => {
        if (paragraph.length > 0) {
            blocks.push({ kind: "paragraph", runs: toRuns(paragraph) });
            paragraph = [];
        }
    };

    for (const line of normalized.split("\n")) {
        // Trailing whitespace goes; leading whitespace stays, because an
        // indented line is an outline level and losing it flattens the file.
        const trimmed = line.trimEnd();

        if (trimmed.length === 0) {
            flush();

            continue;
        }

        paragraph.push(trimmed);
    }

    flush();

    return { blocks: dropEmptyBlocks(blocks), title: readTitle(normalized) };
}

function readTitle(normalized: string): string | null {
    const lines = normalized.split("\n");
    const firstIndex = lines.findIndex((line) => line.trim().length > 0);

    if (firstIndex < 0) {
        return null;
    }

    const first = lines[firstIndex].trim();
    const next = lines[firstIndex + 1];

    // Followed by a blank line, or by nothing at all. A first line with prose
    // directly under it is a paragraph opening, not a title.
    const standsAlone = next === undefined || next.trim().length === 0;

    return standsAlone && first.length <= MAX_TITLE_LENGTH ? first : null;
}
