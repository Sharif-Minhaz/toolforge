/**
 * Where a rendered JSON document can fold, and which lines are left on screen
 * once some of it has.
 *
 * Works on the *text*, not on a parsed tree, because what folds is a run of
 * lines — and a tree has forgotten which line anything was on. A bracket that
 * opens on one line and closes on a later one is a fold; one that closes on the
 * line it opened (`[]`, `{"a": 1}`) is not, because there is nothing to hide.
 *
 * Like the highlighter it never throws. The text is usually output this site
 * wrote, but a GraphQL response or a pasted body can be anything, and a stray
 * bracket should cost a fold rather than the panel.
 */

export type JsonFold = {
    /** Zero-based line holding the opening bracket. */
    readonly startLine: number;
    /** Column just past the opening bracket, where a collapsed row cuts. */
    readonly openEnd: number;
    /** Zero-based line holding the matching closing bracket. */
    readonly endLine: number;
    /** Column of the closing bracket, where a collapsed row resumes. */
    readonly closeStart: number;
    /** Containers around this one; the document's root is zero. */
    readonly depth: number;
};

const CLOSER_FOR: Readonly<Record<string, string>> = { "{": "}", "[": "]" };

type OpenBracket = {
    readonly closer: string;
    readonly line: number;
    readonly column: number;
};

export function splitLines(source: string): string[] {
    return source.split("\n");
}

/**
 * Every fold, keyed by the line it starts on.
 *
 * One fold per line: when two brackets open on the same line and both span
 * lines (`[{`), the outer one wins, because it is the one whose collapse leaves
 * the row reading as a whole value — `[…]` rather than `[{…}` with a dangling
 * bracket three hundred lines further down.
 *
 * A string ends at a newline even without its closing quote. JSON cannot hold a
 * raw newline inside a string, so a quote left open is malformed input, and
 * letting it run on would swallow every bracket after it.
 */
export function findJsonFolds(source: string): ReadonlyMap<number, JsonFold> {
    const folds = new Map<number, JsonFold>();
    const stack: OpenBracket[] = [];
    let line = 0;
    let lineStart = 0;
    let index = 0;

    while (index < source.length) {
        const char = source[index];

        if (char === "\n") {
            line += 1;
            lineStart = index + 1;
            index += 1;
            continue;
        }

        if (char === '"') {
            index += 1;

            while (index < source.length && source[index] !== '"' && source[index] !== "\n") {
                index += source[index] === "\\" ? 2 : 1;
            }

            // Past the closing quote; a newline is left for the loop to count.
            if (source[index] === '"') {
                index += 1;
            }

            continue;
        }

        const closer = CLOSER_FOR[char];

        if (closer !== undefined) {
            stack.push({ closer, line, column: index - lineStart });
            index += 1;
            continue;
        }

        if (char === "}" || char === "]") {
            const open = stack[stack.length - 1];

            // A closer that does not match is ignored rather than popped, so
            // one stray bracket does not shift every pairing after it.
            if (open !== undefined && open.closer === char) {
                stack.pop();

                const existing = folds.get(open.line);

                if (open.line < line && (existing === undefined || existing.endLine < line)) {
                    folds.set(open.line, {
                        startLine: open.line,
                        openEnd: open.column + 1,
                        endLine: line,
                        closeStart: index - lineStart,
                        depth: stack.length,
                    });
                }
            }
        }

        index += 1;
    }

    return folds;
}

/**
 * The lines still on screen, in order. A collapsed fold contributes its first
 * line — which the viewer draws with the last line's tail appended — and every
 * line up to and including its closing bracket is skipped.
 */
export function visibleLines(
    lineCount: number,
    folds: ReadonlyMap<number, JsonFold>,
    collapsed: ReadonlySet<number>,
): number[] {
    const rows: number[] = [];
    let line = 0;

    while (line < lineCount) {
        rows.push(line);

        const fold = collapsed.has(line) ? folds.get(line) : undefined;

        line = fold === undefined ? line + 1 : fold.endLine + 1;
    }

    return rows;
}

/**
 * What "collapse all" folds: everything below the root, so the top-level
 * members stay readable as a list. A document whose root is the only fold
 * (a flat object) collapses that instead, or the button would do nothing.
 */
export function collapseAllTargets(folds: ReadonlyMap<number, JsonFold>): ReadonlySet<number> {
    const nested = [...folds.values()].filter((fold) => fold.depth > 0);
    const targets = nested.length > 0 ? nested : [...folds.values()];

    return new Set(targets.map((fold) => fold.startLine));
}

/** A tab's width where no `tab-size` is set, which is how the viewer renders. */
const TAB_COLUMNS = 8;

/**
 * The widest line, in character cells, so a virtualized list can be as wide as
 * its longest row while only a screenful of rows exists in the DOM. Leading
 * tabs — the formatter's tab indentation — count as a full stop each.
 */
export function longestLineColumns(lines: readonly string[]): number {
    let widest = 0;

    for (const line of lines) {
        let tabs = 0;

        while (line[tabs] === "\t") {
            tabs += 1;
        }

        widest = Math.max(widest, line.length + tabs * (TAB_COLUMNS - 1));
    }

    return widest;
}
