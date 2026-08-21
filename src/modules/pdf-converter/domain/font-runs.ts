import type {
    DocBlock,
    FontRun,
    InlineRun,
    PdfFontFamily,
    PdfScript,
    SourceDocument,
} from "../types";
import { isNeutralCodepoint, scriptOfCodepoint } from "./scripts";

/**
 * Which family draws which script, and which one draws code.
 *
 * Two axes, resolved in one order: **script wins**. Roboto Mono has no Bengali
 * glyphs, so a Bengali identifier inside a fenced block is drawn by the Bengali
 * font and loses its monospacing — which is a smaller loss than a row of empty
 * boxes. Everything Roboto cannot draw still resolves to Roboto, which is the
 * honest answer: the glyphs come out blank, and
 * `PdfConversionNotes.unsupportedScripts` is what tells the reader so. Falling
 * back to the Bengali font instead would turn one visible gap into two.
 */
const FAMILY_BY_SCRIPT: Partial<Record<PdfScript, PdfFontFamily>> = {
    bengali: "NotoSansBengali",
};

export function familyFor(script: PdfScript, monospaced: boolean): PdfFontFamily {
    const byScript = FAMILY_BY_SCRIPT[script];

    if (byScript !== undefined) {
        return byScript;
    }

    return monospaced ? "RobotoMono" : "Roboto";
}

/**
 * Split one stretch of text into the longest runs a single font can draw.
 *
 * This exists because **Noto Sans Bengali carries no Latin glyphs at all** —
 * not a comma, not a full stop, not a digit. Handing a whole paragraph to it
 * because the paragraph contains Bengali puts an empty box wherever a colon
 * was; handing the paragraph to Roboto because it contains a colon empties
 * every Bengali word. Neither family is the paragraph's font. The run is.
 *
 * Neutral characters — spaces, joiners — extend whichever run they land in
 * rather than starting one of their own. A `ZWNJ` inside a conjunct is
 * precisely where a split would be visible, and a space that changed font
 * would change the width of the gap between two words for no reason.
 */
export function splitIntoFontRuns(text: string, monospaced = false): readonly FontRun[] {
    if (text.length === 0) {
        return [];
    }

    const runs: FontRun[] = [];
    let current: PdfFontFamily | null = null;
    let buffer = "";

    for (const character of text) {
        const codepoint = character.codePointAt(0);

        if (codepoint !== undefined && isNeutralCodepoint(codepoint) && current !== null) {
            buffer += character;

            continue;
        }

        const family =
            codepoint === undefined
                ? familyFor("latin", monospaced)
                : familyFor(scriptOfCodepoint(codepoint), monospaced);

        if (family !== current) {
            if (current !== null) {
                runs.push({ text: buffer, font: current });
            }

            current = family;
            buffer = character;

            continue;
        }

        buffer += character;
    }

    if (current !== null) {
        runs.push({ text: buffer, font: current });
    }

    return runs;
}

/** Every family one paragraph's worth of runs needs. */
export function familiesForRuns(runs: readonly InlineRun[]): readonly PdfFontFamily[] {
    const families = new Set<PdfFontFamily>();

    for (const run of runs) {
        for (const piece of splitIntoFontRuns(run.text, run.code === true)) {
            families.add(piece.font);
        }
    }

    return [...families];
}

/**
 * Every family a whole document needs, asked once.
 *
 * The island fetches a pack per family rather than per paragraph, so this walks
 * the document before anything is drawn. `Roboto` is always in the answer for a
 * non-empty document and is always already loaded — it is left in rather than
 * filtered out, because "which families does this need" is a different question
 * from "which ones have to be fetched", and the caller owns the second one.
 */
export function requiredFontFamilies(document: SourceDocument): readonly PdfFontFamily[] {
    const families = new Set<PdfFontFamily>();

    const addRuns = (runs: readonly InlineRun[]) => {
        for (const family of familiesForRuns(runs)) {
            families.add(family);
        }
    };

    if (document.layout === "slides") {
        for (const slide of document.slides) {
            for (const shape of slide.shapes) {
                if (shape.kind === "text") {
                    for (const paragraph of shape.paragraphs) {
                        addRuns(paragraph.runs);
                    }
                }

                if (shape.kind === "table") {
                    for (const row of [
                        ...(shape.head === null ? [] : [shape.head]),
                        ...shape.rows,
                    ]) {
                        for (const cell of row) {
                            addRuns(cell.runs);
                        }
                    }
                }
            }

            addBlockFamilies(slide.notes, addRuns);
        }

        return [...families];
    }

    addBlockFamilies(document.blocks, addRuns);

    return [...families];
}

function addBlockFamilies(
    blocks: readonly DocBlock[],
    addRuns: (runs: readonly InlineRun[]) => void,
): void {
    for (const block of blocks) {
        switch (block.kind) {
            case "heading":
            case "paragraph":
            case "quote":
                addRuns(block.runs);

                break;

            case "list":
                for (const item of block.items) {
                    addRuns(item.runs);
                }

                break;

            case "code":
                addRuns([{ text: block.text, code: true }]);

                break;

            case "table":
                for (const row of [...(block.head === null ? [] : [block.head]), ...block.rows]) {
                    for (const cell of row) {
                        addRuns(cell.runs);
                    }
                }

                break;

            default:
                break;
        }
    }
}
