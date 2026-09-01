import { splitLines } from "@/modules/tools/domain/lines";
import type { SplitMode, SplitReport } from "../types";
import { SMART_MIN_WRAP_WIDTH, SMART_MIN_WRAPPED_LINES, SMART_WRAP_TOLERANCE } from "./constants";
import { hasMarker } from "./markers";

/**
 * Cutting a paste into items — the only genuinely hard part of this tool.
 *
 * A textarea soft-wraps for display and puts no character in the text where it
 * does it, so a visually wrapped line is already one line here and needs no
 * defending. What does need defending is the other kind: text that arrived with
 * real newlines inside its sentences, because it was written in a mail client,
 * copied out of a PDF, or pulled from a file somebody ran through `fmt`. Those
 * newlines are an artefact of the width of a window that no longer exists, and
 * treating each one as an item turns one paragraph into nine bullets.
 *
 * `smart` mode folds them back. It is a heuristic and it says so — the result
 * carries how many lines it joined and which column it decided on, and the
 * workbench puts both on screen.
 */

/** What ends a sentence, allowing for a closing quote or bracket after it. */
const SENTENCE_END = /[.!?…:;][)\]}"'”’»]*$/u;

/**
 * A word broken across a line break: a hyphen with a letter on each side of the
 * split. Joined without the hyphen, because `inter-` + `national` is one word.
 */
const WORD_HYPHEN = /\p{L}-$/u;

/**
 * The column the text appears to be wrapped at, or `null` when it does not look
 * wrapped at all.
 *
 * "Looks wrapped" is deliberately narrow — see the reasoning on the three
 * constants. Getting this wrong in the permissive direction merges a list;
 * getting it wrong in the strict direction leaves the reader exactly where
 * `line` mode would have, which is a result they can still use.
 */
export function detectWrapWidth(lines: readonly string[]): number | null {
    const lengths = lines.map((line) => [...line].length);
    const longest = Math.max(0, ...lengths);

    if (longest < SMART_MIN_WRAP_WIDTH) {
        return null;
    }

    const nearLongest = lengths.filter((length) => length >= longest - SMART_WRAP_TOLERANCE);

    return nearLongest.length >= SMART_MIN_WRAPPED_LINES ? longest : null;
}

/**
 * Whether `current` is the tail of the line above it rather than an item of its
 * own. Every condition is a veto; the length test is the last word.
 */
function isContinuation(previous: string, current: string, wrapWidth: number | null): boolean {
    if (previous.trim().length === 0 || current.trim().length === 0) {
        return false;
    }

    // A marker is the one signal the reader wrote on purpose. It outranks every
    // measurement below it, so a wrapped `1.` item never swallows the `2.`.
    if (hasMarker(current)) {
        return false;
    }

    const tail = previous.trimEnd();

    // A word split across the break is unambiguous, whatever the line lengths
    // say — no writer ends an item on a hyphen.
    if (WORD_HYPHEN.test(tail)) {
        return true;
    }

    if (SENTENCE_END.test(tail)) {
        return false;
    }

    if (wrapWidth === null) {
        return false;
    }

    // A line that stopped well short of the wrap column stopped because
    // somebody pressed return, not because it ran out of room.
    return [...tail].length >= wrapWidth - SMART_WRAP_TOLERANCE;
}

/** Joins a continuation onto its line, eating the hyphen where there was one. */
function appendContinuation(item: string, continuation: string): string {
    const tail = item.trimEnd();
    const rest = continuation.trimStart();

    if (WORD_HYPHEN.test(tail)) {
        return tail.slice(0, -1) + rest;
    }

    return `${tail} ${rest}`;
}

function splitSmart(lines: readonly string[]): SplitReport {
    const wrapWidth = detectWrapWidth(lines);
    const items: string[] = [];
    let joined = 0;
    // The previous *physical* line, which is not the previous item once two
    // have been folded together. Measuring the accumulated item instead would
    // compare a 126-character paragraph against the wrap column and swallow
    // every short line after it.
    let previousLine: string | undefined;

    for (const line of lines) {
        const item = items.at(-1);

        if (
            item !== undefined &&
            previousLine !== undefined &&
            isContinuation(previousLine, line, wrapWidth)
        ) {
            items[items.length - 1] = appendContinuation(item, line);
            joined += 1;
            previousLine = line;

            continue;
        }

        items.push(line);
        previousLine = line;
    }

    return { items, joined, wrapWidth };
}

/**
 * Paragraph mode: only a blank line ends an item, and every newline inside one
 * becomes a single space. No heuristic at all — the reader has told us where
 * the boundaries are, which is why this is the mode to reach for when `smart`
 * has guessed wrong.
 */
function splitParagraphs(lines: readonly string[]): SplitReport {
    const items: string[] = [];
    let joined = 0;
    let open = false;

    for (const line of lines) {
        if (line.trim().length === 0) {
            open = false;

            continue;
        }

        if (open) {
            items[items.length - 1] = `${items[items.length - 1].trimEnd()} ${line.trimStart()}`;
            joined += 1;

            continue;
        }

        items.push(line);
        open = true;
    }

    return { items, joined, wrapWidth: null };
}

export function splitIntoItems(text: string, mode: SplitMode): SplitReport {
    const lines = splitLines(text);

    switch (mode) {
        case "line":
            return { items: lines, joined: 0, wrapWidth: null };
        case "smart":
            return splitSmart(lines);
        case "paragraph":
            return splitParagraphs(lines);
    }
}
