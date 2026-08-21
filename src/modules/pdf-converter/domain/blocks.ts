import type { DocBlock, InlineRun, SourceDocument, TableCell } from "../types";

/**
 * The small operations every reader performs on runs and blocks, in one place
 * so six readers cannot arrive at six answers to "is this paragraph empty".
 */

/** Runs of `\t`, `\n` and repeated spaces become one space, the way HTML reads them. */
export function collapseWhitespace(text: string): string {
    return text.replace(/\s+/g, " ");
}

export function runsToText(runs: readonly InlineRun[]): string {
    return runs.map((run) => run.text).join("");
}

function sameMarks(left: InlineRun, right: InlineRun): boolean {
    return (
        left.bold === right.bold &&
        left.italic === right.italic &&
        left.underline === right.underline &&
        left.strike === right.strike &&
        left.code === right.code &&
        left.link === right.link
    );
}

/**
 * Drops empty runs and merges neighbours that carry the same marks.
 *
 * Worth doing before the renderer sees them: a paragraph read out of Word
 * arrives as one run per spell-check boundary, and `pdfmake` measures every
 * one of them separately. Merging is also what makes the font split in
 * `font-runs.ts` produce the *longest* stretch a family can draw rather than
 * one run per character.
 */
export function normalizeRuns(runs: readonly InlineRun[]): readonly InlineRun[] {
    const merged: InlineRun[] = [];

    for (const run of runs) {
        if (run.text.length === 0) {
            continue;
        }

        const previous = merged[merged.length - 1];

        if (previous !== undefined && sameMarks(previous, run)) {
            merged[merged.length - 1] = { ...previous, text: previous.text + run.text };

            continue;
        }

        merged.push(run);
    }

    return merged;
}

export function isBlankRuns(runs: readonly InlineRun[]): boolean {
    return runsToText(runs).trim().length === 0;
}

/** Trims the leading and trailing space off a paragraph without touching the middle. */
export function trimRuns(runs: readonly InlineRun[]): readonly InlineRun[] {
    const trimmed = [...runs];

    while (trimmed.length > 0 && trimmed[0].text.trimStart().length === 0) {
        trimmed.shift();
    }

    if (trimmed.length > 0) {
        trimmed[0] = { ...trimmed[0], text: trimmed[0].text.trimStart() };
    }

    while (trimmed.length > 0 && trimmed[trimmed.length - 1].text.trimEnd().length === 0) {
        trimmed.pop();
    }

    if (trimmed.length > 0) {
        const last = trimmed[trimmed.length - 1];

        trimmed[trimmed.length - 1] = { ...last, text: last.text.trimEnd() };
    }

    return normalizeRuns(trimmed);
}

export function plainRun(text: string): InlineRun {
    return { text };
}

export function textCell(text: string): TableCell {
    return { runs: [plainRun(text)] };
}

/**
 * A block that would render as nothing.
 *
 * A table with no rows and a list with no items are both worth removing rather
 * than drawing: an empty bordered box in the middle of a report reads as a
 * conversion fault, which is exactly what it would be.
 */
export function isEmptyBlock(block: DocBlock): boolean {
    switch (block.kind) {
        case "heading":
        case "paragraph":
        case "quote":
            return isBlankRuns(block.runs);
        case "list":
            return block.items.length === 0;
        case "table":
            return block.rows.length === 0 && block.head === null;
        case "code":
            return block.text.trim().length === 0;
        default:
            return false;
    }
}

export function dropEmptyBlocks(blocks: readonly DocBlock[]): readonly DocBlock[] {
    return blocks.filter((block) => !isEmptyBlock(block));
}

/**
 * Every character in a document, for the one question asked of all of it at
 * once: which scripts are in here, and is there a font for them.
 *
 * Concatenated with newlines rather than joined tightly, so a Bengali word at
 * the end of one block and a Latin one at the start of the next are never
 * mistaken for a single token.
 */
export function documentText(document: SourceDocument): string {
    if (document.layout === "slides") {
        return document.slides
            .flatMap((slide) => [
                ...slide.shapes.flatMap((shape) =>
                    shape.kind === "text"
                        ? shape.paragraphs.map((paragraph) => runsToText(paragraph.runs))
                        : [],
                ),
                blocksText(slide.notes),
            ])
            .join("\n");
    }

    return blocksText(document.blocks);
}

export function blocksText(blocks: readonly DocBlock[]): string {
    return blocks
        .map((block) => {
            switch (block.kind) {
                case "heading":
                case "paragraph":
                case "quote":
                    return runsToText(block.runs);
                case "list":
                    return block.items.map((item) => runsToText(item.runs)).join("\n");
                case "code":
                    return block.text;
                case "table":
                    return [...(block.head === null ? [] : [block.head]), ...block.rows]
                        .map((row) => row.map((cell) => runsToText(cell.runs)).join("\t"))
                        .join("\n");
                default:
                    return "";
            }
        })
        .join("\n");
}

/** The first heading in a flowed document, which is what names the PDF file. */
export function firstHeadingText(blocks: readonly DocBlock[]): string | null {
    for (const block of blocks) {
        if (block.kind === "heading") {
            const text = runsToText(block.runs).trim();

            if (text.length > 0) {
                return text;
            }
        }
    }

    return null;
}
