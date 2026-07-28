import type { RegexNode } from "../types";
import { walkNodes } from "./parse";

/**
 * `x` and `U` do not exist in ECMAScript, so the pattern is rewritten into one
 * the engine can run.
 *
 * The rewrite works from the parse tree rather than a second scan of the text,
 * which is what makes it safe: only a real quantifier is inverted, and only
 * whitespace the parser already ruled inert is dropped. Highlighting and the
 * explanation keep describing the *typed* pattern, so the two never drift —
 * only the string handed to `new RegExp` changes.
 */

export type CompileOptions = {
    readonly extended: boolean;
    readonly ungreedy: boolean;
};

type Edit = {
    readonly start: number;
    readonly end: number;
    readonly replacement: string;
};

/** Inverts a quantifier's greed: `a+` ⇄ `a+?`. Possessive forms are left be. */
function invertGreed(pattern: string, start: number, end: number, greedy: boolean): string {
    const source = pattern.slice(start, end);

    return greedy ? `${source}?` : source.slice(0, -1);
}

export function toCompiledSource(
    pattern: string,
    root: RegexNode,
    options: CompileOptions,
): string {
    const edits: Edit[] = [];

    walkNodes(root, (node) => {
        // Whitespace and `#` comments only ever become their own nodes when the
        // pattern was parsed with `extended` on, so this needs no second guard.
        if (
            options.extended &&
            (node.kind === "ignorableWhitespace" ||
                (node.kind === "comment" && node.openLength === undefined))
        ) {
            edits.push({ start: node.start, end: node.end, replacement: "" });

            return;
        }

        const quantifier = node.quantifier;

        if (options.ungreedy && quantifier !== undefined && !quantifier.possessive) {
            edits.push({
                start: quantifier.start,
                end: quantifier.end,
                replacement: invertGreed(
                    pattern,
                    quantifier.start,
                    quantifier.end,
                    quantifier.greedy,
                ),
            });
        }
    });

    if (edits.length === 0) {
        return pattern;
    }

    // Applied back to front so earlier offsets stay valid.
    return edits
        .toSorted((a, b) => b.start - a.start)
        .reduce(
            (source, edit) =>
                source.slice(0, edit.start) + edit.replacement + source.slice(edit.end),
            pattern,
        );
}

export type CompileResult =
    | { readonly ok: true; readonly regex: RegExp }
    | { readonly ok: false; readonly message: string };

/**
 * The engine has the final say on whether a pattern is valid. Its own message
 * is passed through verbatim — a paraphrase would be one more thing to keep in
 * step with whichever browser the reader is using.
 */
export function compilePattern(source: string, engineFlags: string): CompileResult {
    try {
        return { ok: true, regex: new RegExp(source, engineFlags) };
    } catch (caught) {
        return { ok: false, message: caught instanceof Error ? caught.message : String(caught) };
    }
}
