import type { BulletStyle, NumberStyle } from "../types";

/**
 * Reading a list marker off a line, and writing a new one back on.
 *
 * Both halves live here because they are the same fact seen twice: the set this
 * file can write is a subset of the set it can recognise, and a list that goes
 * out as `a. item` has to come back in as `item` when the reader switches to
 * bullets. A tool that can produce a marker it cannot then strip renumbers its
 * own output into `1. a. item`.
 */

/**
 * Every character seen at the head of a hand-written list. Wider than the four
 * this tool writes: a paste comes from somewhere else, and Word, Notion and a
 * dozen Markdown renderers each have their own.
 */
const BULLET_CHARACTERS = new Set(["-", "*", "+", "•", "‣", "▪", "◦", "·", "–", "—", "→"]);

/**
 * `[ ]`, `[x]`, `[X]` — a Markdown task box, which follows its bullet.
 *
 * Matched against the rest of the line rather than against a whitespace-split
 * token, because the empty box has a space inside it and would otherwise be
 * cut in half.
 */
const CHECKBOX = /^\[[ xX]\]\s*/u;

/**
 * An ordinal followed by its punctuation: `1.`, `12)`, `iv.`, `a)`, `(3)` with
 * the opening bracket already eaten below.
 *
 * The letter forms are one character and the roman ones at least two, and that
 * asymmetry is the whole defence against eating prose. `Mr.` and `So.` are two
 * letters and neither is a roman numeral, so neither is a marker; `a.` and
 * `iv.` are. What it does still take is a single initial — `A. Lincoln` loses
 * its `A.` — which is a genuine ambiguity rather than a bug, and the reason the
 * switch that reaches this code can be turned off.
 *
 * A colon is deliberately not list punctuation: `a: value` is a YAML mapping,
 * and pasting one into a sorter is a thing people do.
 */
const ORDINAL = /^(?:\d{1,9}|[A-Za-z]|[ivxlcdm]{2,7}|[IVXLCDM]{2,7})[.)\]]$/u;

export type MarkerStrip = {
    /** The line with its marker and the whitespace around it removed. */
    readonly text: string;
    readonly hadMarker: boolean;
};

/**
 * The marker off the front of one line, if it has one.
 *
 * Leading whitespace goes with it, and only with it: a line with no marker
 * keeps its indentation, so an indented block that was never a list is not
 * quietly flattened by a switch about bullets.
 */
export function stripMarker(line: string): MarkerStrip {
    const body = line.replace(/^\s+/u, "");

    if (body.length === 0) {
        return { text: line, hadMarker: false };
    }

    // `(3)` and `[4]` open with a bracket the ordinal pattern does not carry.
    const opened = /^[([]/u.test(body) ? body.slice(1) : body;
    const token = opened.split(/\s/u, 1)[0] ?? "";

    if (BULLET_CHARACTERS.has(token)) {
        const rest = opened.slice(token.length).replace(/^\s+/u, "");

        return { text: rest.replace(CHECKBOX, ""), hadMarker: true };
    }

    if (ORDINAL.test(token)) {
        return { text: opened.slice(token.length).replace(/^\s+/u, ""), hadMarker: true };
    }

    return { text: line, hadMarker: false };
}

/**
 * Whether a line opens a new item on the strength of its marker alone. Read by
 * the smart splitter, which must never fold `2. Run the migration` into the
 * line above it however wrapped that line looks.
 */
export function hasMarker(line: string): boolean {
    return stripMarker(line).hadMarker;
}

/** What each bullet style writes. Data, not copy — a hyphen is a hyphen. */
export const BULLET_MARKERS: Record<BulletStyle, string> = {
    dash: "-",
    asterisk: "*",
    bullet: "•",
    task: "- [ ]",
};

const ROMAN_NUMERALS = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
] as const;

/**
 * `1 → a`, `26 → z`, `27 → aa`. Bijective base-26, which is the scheme a
 * spreadsheet's columns use and the only one where the sequence never repeats a
 * label.
 */
export function toAlphabetic(value: number): string {
    let remaining = value;
    let out = "";

    while (remaining > 0) {
        const index = (remaining - 1) % 26;
        out = String.fromCharCode(97 + index) + out;
        remaining = Math.floor((remaining - 1) / 26);
    }

    return out;
}

export function toRoman(value: number): string {
    let remaining = value;
    let out = "";

    for (const [amount, numeral] of ROMAN_NUMERALS) {
        while (remaining >= amount) {
            out += numeral;
            remaining -= amount;
        }
    }

    return out;
}

/**
 * The label for one ordinal.
 *
 * `padded` takes the width of the largest ordinal in the list rather than a
 * fixed two, so a hundred-item list lines up at `001` and a nine-item one is
 * not padded to `0001` for no reason.
 *
 * Roman and alphabetic have no zero and no negatives, so a list started at `0`
 * falls back to the decimal for that one item rather than emitting an empty
 * label. Documented in the article, and the reason `startNumber` may be zero at
 * all: a code listing is often numbered from it.
 */
export function formatOrdinal(style: NumberStyle, value: number, width: number): string {
    switch (style) {
        case "decimal":
            return `${value}.`;
        case "paren":
            return `${value})`;
        case "padded":
            return `${String(value).padStart(width, "0")}.`;
        case "alpha":
            return value > 0 ? `${toAlphabetic(value)}.` : `${value}.`;
        case "roman":
            return value > 0 ? `${toRoman(value)}.` : `${value}.`;
    }
}

/** Digits in the largest ordinal a list will reach, never fewer than two. */
export function ordinalWidth(startNumber: number, count: number): number {
    const last = startNumber + Math.max(count - 1, 0);

    return Math.max(2, String(last).length);
}
