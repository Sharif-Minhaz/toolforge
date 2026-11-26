import type { ShellWord } from "@/modules/tools/domain/shell-tokenize";
import type { ConversionNote } from "../types";

/** `$` doubled. A function, because `"$$"` as a replacement string means one `$`. */
function escapeDollars(text: string): string {
    return text.replaceAll("$", () => "$$");
}

/**
 * Compose interpolates every value it reads: `${TAG}` and `$TAG` are variables
 * and `$$` is a literal dollar. A shell does the same to unquoted and
 * double-quoted text and nothing to single-quoted text. So `$` is translated by
 * where it stood, not by what it is — `'pa$word'` must become `pa$$word`, and
 * `"$HOME"` must stay `$HOME`.
 */

/** Where the matching close sits, counting nested opens. -1 when unclosed. */
function findClose(text: string, start: number, open: string, close: string): number {
    let depth = 0;

    for (let index = start; index < text.length; index += 1) {
        if (text[index] === open) {
            depth += 1;
        } else if (text[index] === close) {
            depth -= 1;

            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
}

const NAME_START = /[A-Za-z_]/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;

/** The text the shell would have run instead of keeping, as compose-safe literal text. */
function substitution(source: string, notes: ConversionNote[]): string {
    const inner = source.startsWith("$(") ? source.slice(2, -1) : source.slice(1, -1);

    // The one substitution compose can express: it reads PWD from the same shell.
    if (inner.trim() === "pwd") {
        notes.push({ id: "pwdVariable", kind: "adapted", detail: source });

        return "${PWD}";
    }

    notes.push({ id: "commandSubstitution", kind: "dropped", detail: source });

    return escapeDollars(source);
}

function expandableToCompose(text: string, notes: ConversionNote[]): string {
    let out = "";
    let index = 0;

    while (index < text.length) {
        const char = text[index];

        if (char === "`") {
            const end = text.indexOf("`", index + 1);

            if (end !== -1) {
                out += substitution(text.slice(index, end + 1), notes);
                index = end + 1;
                continue;
            }
        }

        if (char !== "$") {
            out += char;
            index += 1;
            continue;
        }

        const next = text[index + 1] ?? "";

        if (next === "(") {
            const end = findClose(text, index + 1, "(", ")");

            if (end !== -1) {
                out += substitution(text.slice(index, end + 1), notes);
                index = end + 1;
                continue;
            }
        }

        if (next === "{") {
            const end = findClose(text, index + 1, "{", "}");

            if (end !== -1) {
                out += text.slice(index, end + 1);
                index = end + 1;
                continue;
            }
        }

        if (NAME_START.test(next)) {
            const name = NAME.exec(text.slice(index + 1));

            out += `$${name?.[0] ?? ""}`;
            index += 1 + (name?.[0].length ?? 0);
            continue;
        }

        // `$1`, `$?`, a lone `$`: nothing compose could read, so a literal.
        out += "$$";
        index += 1;
    }

    return out;
}

/** A shell word as a compose value. */
export function wordToCompose(word: ShellWord, notes: ConversionNote[]): string {
    return word
        .map((segment) =>
            segment.expandable
                ? expandableToCompose(segment.text, notes)
                : escapeDollars(segment.text),
        )
        .join("");
}

export type InterpolationPart =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "variable"; readonly source: string; readonly name: string };

/** A compose value cut into literal text and the variables compose would fill. */
export function splitInterpolation(value: string): readonly InterpolationPart[] {
    const parts: InterpolationPart[] = [];
    let text = "";
    let index = 0;

    const variable = (source: string, name: string) => {
        if (text.length > 0) {
            parts.push({ kind: "text", text });
            text = "";
        }

        parts.push({ kind: "variable", source, name });
    };

    while (index < value.length) {
        const char = value[index];
        const next = value[index + 1] ?? "";

        if (char !== "$") {
            text += char;
            index += 1;
            continue;
        }

        if (next === "$") {
            text += "$";
            index += 2;
            continue;
        }

        if (next === "{") {
            const end = findClose(value, index + 1, "{", "}");

            if (end !== -1) {
                const source = value.slice(index, end + 1);

                variable(source, NAME.exec(source.slice(2))?.[0] ?? source);
                index = end + 1;
                continue;
            }
        }

        const name = NAME_START.test(next) ? NAME.exec(value.slice(index + 1)) : null;

        if (name) {
            variable(`$${name[0]}`, name[0]);
            index += 1 + name[0].length;
            continue;
        }

        // Compose refuses a lone `$`; reading it as a literal is the kinder guess.
        text += "$";
        index += 1;
    }

    if (text.length > 0) {
        parts.push({ kind: "text", text });
    }

    return parts;
}
