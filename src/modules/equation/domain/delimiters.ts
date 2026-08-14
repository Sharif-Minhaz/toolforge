/**
 * Unwrapping LaTeX that arrived with its delimiters still on.
 *
 * The common case this exists for is a paste out of an assistant. Ask one for an
 * equation and it answers in one of five shapes — `$…$`, `$$…$$`, `\(…\)`,
 * `\[…\]`, or a fenced ```latex block — because those are how maths is written
 * *inside a document*. None of them are LaTeX the renderer takes: KaTeX wants
 * the equation, and is handed the wrapper too. Left alone, `$$x^2$$` renders as
 * dollar signs around an equation, and a block spread over three lines is read
 * as three separate equations, two of which are punctuation.
 *
 * So the wrapper is stripped before anything else looks at the text — and it is
 * read on the way past, because it says something the equation cannot: `$$` and
 * `\[` mean the author wanted a display block, `$` and `\(` mean inline. That
 * sets the display switch, so a pasted block comes back set the way it was
 * written.
 */

/** A fence line: ``` on its own, with or without a language after it. */
const FENCE = /^```[A-Za-z]*$/;

/** A block delimiter sitting alone on its line, which is how an LLM writes one. */
const BLOCK_OPEN = /^(?:\$\$|\\\[)$/;

const BLOCK_CLOSE = /^(?:\$\$|\\\])$/;

type Wrapper = {
    readonly open: string;
    readonly close: string;
    readonly display: boolean;
};

/**
 * Longest first, so `$$x$$` is not read as `$` around `$x$`. The `$` pair has to
 * come last for the same reason.
 */
const WRAPPERS: readonly Wrapper[] = [
    { open: "$$", close: "$$", display: true },
    { open: "\\[", close: "\\]", display: true },
    { open: "\\(", close: "\\)", display: false },
    { open: "$", close: "$", display: false },
];

export type DelimiterStrip = {
    readonly text: string;
    /**
     * What the delimiters said about display mode, or `null` when there were
     * none. `null` rather than a default, so a shared link's own `?display=`
     * can tell "the paste asked for inline" from "the paste did not say".
     */
    readonly display: boolean | null;
};

/** Whether a line is wrapped, allowing for the pair being the whole of it. */
function unwrapLine(line: string): { body: string; display: boolean } | null {
    for (const wrapper of WRAPPERS) {
        const shortest = wrapper.open.length + wrapper.close.length;

        if (
            line.length > shortest &&
            line.startsWith(wrapper.open) &&
            line.endsWith(wrapper.close)
        ) {
            return {
                body: line.slice(wrapper.open.length, -wrapper.close.length).trim(),
                display: wrapper.display,
            };
        }
    }

    return null;
}

/**
 * A block whose delimiters are on their own lines, joined back into one
 * equation.
 *
 * Joined with a space rather than kept as separate lines because it *is* one
 * equation — an `aligned` environment broken over four lines is still a single
 * formula, and splitting it would hand three of those lines to the converter as
 * equations in their own right.
 */
function unwrapBlock(lines: readonly string[]): DelimiterStrip | null {
    const first = lines[0];
    const last = lines[lines.length - 1];

    if (lines.length < 2 || !BLOCK_OPEN.test(first) || !BLOCK_CLOSE.test(last)) {
        return null;
    }

    return {
        text: lines.slice(1, -1).join(" ").trim(),
        display: true,
    };
}

/**
 * Takes the delimiters off, and reports what they said about display mode.
 *
 * Deliberately conservative. It only strips a wrapper that begins and ends a
 * whole line, or a block whose delimiters have lines to themselves, because
 * those are the shapes a paste actually arrives in. A `$` in the middle of a
 * line is somebody's dollar sign, and is left where it is.
 */
export function stripMathDelimiters(raw: string): DelimiterStrip {
    const lines = raw
        .split(/\r\n|\r|\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !FENCE.test(line));

    const block = unwrapBlock(lines);

    if (block !== null) {
        return block;
    }

    let display: boolean | null = null;
    const unwrapped = lines.map((line) => {
        const result = unwrapLine(line);

        if (result === null) {
            return line;
        }

        // The first wrapper seen wins. A paste that mixes inline and display
        // has no single answer, and the reader has a switch.
        display ??= result.display;

        return result.body;
    });

    return { text: unwrapped.join("\n"), display };
}
