import { GROUP_DELIMITERS, type EquationToken, type GroupDelimiter } from "../types";
import { OPERATOR_SEQUENCES, SUBSCRIPT_DIGITS, SUPERSCRIPT_DIGITS } from "./symbols";

/**
 * Plain text to a token tree.
 *
 * This layer makes no decisions about meaning. It answers three questions and
 * nothing else: where does each atom start and end, was there a space before it,
 * and what is nested inside what. Every judgement about *what a token means* —
 * whether `x` `2` is a power, whether `/` is a fraction — belongs to
 * `text-to-latex.ts`, which is the only place a reader's ambiguity is resolved.
 *
 * Keeping the two apart is what makes the guesses testable one at a time.
 */

const CLOSING: Record<GroupDelimiter, string> = {
    "(": ")",
    "[": "]",
    "{": "}",
};

const CLOSERS = ")]}";

const LETTER = /\p{L}/u;
const DIGIT = /\d/u;

function isGroupDelimiter(character: string): character is GroupDelimiter {
    return (GROUP_DELIMITERS as readonly string[]).includes(character);
}

/**
 * A backslash command the reader typed, taken whole.
 *
 * Somebody pasting half-finished LaTeX in is a real case — this tool's output is
 * LaTeX, so its output is one of its plausible inputs — and a `\frac` broken into
 * a stray backslash and the letters `frac` would come back as nonsense.
 */
const COMMAND = /^\\(?:[A-Za-z]+|.)/;

type Cursor = {
    readonly text: string;
    index: number;
};

/** What one nesting level came back with, and whether it found its bracket. */
type Level = {
    readonly items: EquationToken[];
    readonly closed: boolean;
};

/** Consumes whitespace, reporting whether any was there. */
function skipSpace(cursor: Cursor): boolean {
    const start = cursor.index;

    while (cursor.index < cursor.text.length && /\s/.test(cursor.text[cursor.index])) {
        cursor.index += 1;
    }

    return cursor.index > start;
}

function readRun(cursor: Cursor, pattern: RegExp): string {
    let run = "";

    while (cursor.index < cursor.text.length && pattern.test(cursor.text[cursor.index])) {
        run += cursor.text[cursor.index];
        cursor.index += 1;
    }

    return run;
}

/** A decimal, with at most one point — `1.5.2` is two numbers and a point. */
function readNumber(cursor: Cursor): string {
    let run = readRun(cursor, DIGIT);

    if (cursor.text[cursor.index] === "." && DIGIT.test(cursor.text[cursor.index + 1] ?? "")) {
        cursor.index += 1;
        run += `.${readRun(cursor, DIGIT)}`;
    }

    return run;
}

/**
 * Runs of Unicode superscript or subscript digits become the operator and its
 * digits, so the rest of the pipeline never has to know they existed. `x²³`
 * arrives as `x`, `^`, `23` — exactly the shape `x^23` would have taken.
 */
function readScriptRun(
    cursor: Cursor,
    table: Record<string, string>,
    operator: "^" | "_",
    spaced: boolean,
): EquationToken[] {
    let digits = "";

    while (cursor.index < cursor.text.length && table[cursor.text[cursor.index]] !== undefined) {
        digits += table[cursor.text[cursor.index]];
        cursor.index += 1;
    }

    return [
        { kind: "operator", text: operator, spaced },
        { kind: "number", text: digits, spaced: false },
    ];
}

function readLevel(cursor: Cursor, closer: string | null): Level {
    const items: EquationToken[] = [];

    while (cursor.index < cursor.text.length) {
        const spaced = skipSpace(cursor);

        if (cursor.index >= cursor.text.length) {
            break;
        }

        const character = cursor.text[cursor.index];

        if (closer !== null && character === closer) {
            cursor.index += 1;

            return { items, closed: true };
        }

        // A closer that belongs to nobody. Kept as an operator rather than
        // dropped: it is what the reader typed, and a silently deleted bracket
        // is the one edit they would never spot in the preview.
        if (closer === null && CLOSERS.includes(character)) {
            items.push({ kind: "operator", text: character, spaced });
            cursor.index += 1;
            continue;
        }

        if (isGroupDelimiter(character)) {
            cursor.index += 1;

            const level = readLevel(cursor, CLOSING[character]);

            items.push({
                kind: "group",
                delimiter: character,
                items: level.items,
                spaced,
                closed: level.closed,
            });
            continue;
        }

        const command = COMMAND.exec(cursor.text.slice(cursor.index))?.[0];

        if (command !== undefined) {
            items.push({ kind: "command", text: command, spaced });
            cursor.index += command.length;
            continue;
        }

        if (SUPERSCRIPT_DIGITS[character] !== undefined) {
            items.push(...readScriptRun(cursor, SUPERSCRIPT_DIGITS, "^", spaced));
            continue;
        }

        if (SUBSCRIPT_DIGITS[character] !== undefined) {
            items.push(...readScriptRun(cursor, SUBSCRIPT_DIGITS, "_", spaced));
            continue;
        }

        if (LETTER.test(character)) {
            items.push({ kind: "word", text: readRun(cursor, LETTER), spaced });
            continue;
        }

        if (DIGIT.test(character)) {
            items.push({ kind: "number", text: readNumber(cursor), spaced });
            continue;
        }

        const sequence = OPERATOR_SEQUENCES.find(([literal]) =>
            cursor.text.startsWith(literal, cursor.index),
        );

        if (sequence !== undefined) {
            items.push({ kind: "operator", text: sequence[0], spaced });
            cursor.index += sequence[0].length;
            continue;
        }

        items.push({ kind: "operator", text: character, spaced });
        cursor.index += 1;
    }

    // The text ran out. At the top level that is the normal ending; inside a
    // bracket it means the reader never closed it.
    return { items, closed: closer === null };
}

export function tokenize(text: string): readonly EquationToken[] {
    return readLevel({ text, index: 0 }, null).items;
}

/** True when any bracket in the tree was closed on the reader's behalf. */
export function hasUnclosedGroup(items: readonly EquationToken[]): boolean {
    return items.some(
        (item) => item.kind === "group" && (!item.closed || hasUnclosedGroup(item.items)),
    );
}
