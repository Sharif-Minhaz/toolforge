/**
 * A tokenizer for *display*, not for meaning.
 *
 * The module already has a shell tokenizer, and it is the wrong tool for this:
 * that one resolves escapes and throws quotes away, because it is working out
 * what curl receives. Highlighting has the opposite requirement — every
 * character of the input must come back out, quotes and backslashes included,
 * in the order it was written. The text is painted *behind* a transparent
 * textarea, so a single character lost or added shifts every glyph after it and
 * the caret stops landing where it points.
 *
 * That requirement is the invariant the tests hold it to:
 * `tokens.map((token) => token.text).join("") === input`, for any input at all.
 *
 * It lives here rather than in `tools/` because only this tool highlights
 * anything so far. The moment a second one does — the Markdown preview's code
 * blocks are the obvious candidate — this file moves to `tools/domain/` whole.
 */

export const TOKEN_KINDS = [
    "plain",
    "comment",
    "string",
    "number",
    "keyword",
    "command",
    "flag",
    "property",
    "function",
    "operator",
    "punctuation",
    "url",
] as const;

export type TokenKind = (typeof TOKEN_KINDS)[number];

export type Token = {
    readonly kind: TokenKind;
    readonly text: string;
};

export const HIGHLIGHT_LANGUAGES = ["shell", "javascript"] as const;

export type HighlightLanguage = (typeof HIGHLIGHT_LANGUAGES)[number];

/** Collects tokens, merging runs of one kind so the DOM stays small. */
class TokenSink {
    private readonly tokens: Token[] = [];

    push(kind: TokenKind, text: string): void {
        if (text.length === 0) {
            return;
        }

        const last = this.tokens[this.tokens.length - 1];

        if (last !== undefined && last.kind === kind) {
            this.tokens[this.tokens.length - 1] = { kind, text: last.text + text };

            return;
        }

        this.tokens.push({ kind, text });
    }

    drain(): Token[] {
        return this.tokens;
    }
}

/* ---------------------------------------------------------------- shell --- */

const SHELL_COMMANDS = /^(?:curl|curl\.exe|wget|http|https)$/i;
const FLAG_BODY = /^[-\w.]+/;
// `#` belongs to a word once one has started — a fragment is part of its URL,
// and only a `#` where a word *may* start opens a comment.
const WORD_BODY = /^[^\s'"`\\^]+/;
const URL_LIKE = /^(?:[a-z][\w+.-]*:\/\/|[\w-]+(?:\.[\w-]+)+(?::\d+)?[/?#])/i;

/** Reads a quoted run, returning the whole thing including both quotes. */
function readQuoted(input: string, start: number, quote: string, escapes: boolean): number {
    let index = start + 1;

    while (index < input.length) {
        if (escapes && input[index] === "\\") {
            index += 2;
            continue;
        }

        if (input[index] === quote) {
            return index + 1;
        }

        index += 1;
    }

    // Unterminated: the rest of the text is still part of the run, and colouring
    // it as a string is the clearest signal that a quote was left open.
    return input.length;
}

function highlightShell(input: string): Token[] {
    const sink = new TokenSink();
    let index = 0;
    let atWordStart = true;

    while (index < input.length) {
        const char = input[index];

        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            sink.push("plain", char);
            index += 1;
            atWordStart = true;
            continue;
        }

        // The three continuation marks, each carrying the command onto the next
        // line. Anything else after a backslash is an ordinary escape.
        if (
            (char === "\\" || char === "^" || char === "`") &&
            /^[\r\n]/.test(input.slice(index + 1))
        ) {
            sink.push("operator", char);
            index += 1;
            atWordStart = false;
            continue;
        }

        if (char === "#" && atWordStart) {
            const end = input.indexOf("\n", index);
            const stop = end === -1 ? input.length : end;

            sink.push("comment", input.slice(index, stop));
            index = stop;
            continue;
        }

        if (char === "$" && input[index + 1] === "'") {
            const end = readQuoted(input, index + 1, "'", true);

            sink.push("string", input.slice(index, end));
            index = end;
            atWordStart = false;
            continue;
        }

        if (char === "'" || char === '"') {
            const end = readQuoted(input, index, char, char === '"');

            sink.push("string", input.slice(index, end));
            index = end;
            atWordStart = false;
            continue;
        }

        if (char === "\\" || char === "^") {
            sink.push("operator", input.slice(index, index + 2));
            index += 2;
            atWordStart = false;
            continue;
        }

        if (char === "-" && atWordStart) {
            const flag = FLAG_BODY.exec(input.slice(index));
            const text = flag ? flag[0] : char;

            sink.push("flag", text);
            index += text.length;
            atWordStart = false;
            continue;
        }

        const word = WORD_BODY.exec(input.slice(index));

        if (word === null) {
            sink.push("plain", char);
            index += 1;
            atWordStart = false;
            continue;
        }

        const text = word[0];

        if (atWordStart && SHELL_COMMANDS.test(text)) {
            sink.push("command", text);
        } else if (URL_LIKE.test(text)) {
            sink.push("url", text);
        } else {
            sink.push("plain", text);
        }

        index += text.length;
        atWordStart = false;
    }

    return sink.drain();
}

/* ----------------------------------------------------------- javascript --- */

const JS_KEYWORDS = new Set([
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "delete",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "of",
    "return",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "yield",
]);

const JS_CONSTANTS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

const JS_IDENTIFIER = /^[A-Za-z_$][\w$]*/;
const JS_NUMBER = /^(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/;
const JS_PUNCTUATION = new Set(["{", "}", "(", ")", "[", "]", ",", ";", ":", "."]);
const JS_OPERATOR = new Set(["=", "+", "-", "*", "/", "%", "<", ">", "!", "?", "&", "|", "~", "^"]);

/** The next non-whitespace character, for deciding what an identifier is. */
function peekNonSpace(input: string, from: number): string {
    let index = from;

    while (index < input.length && /\s/.test(input[index])) {
        index += 1;
    }

    return input[index] ?? "";
}

function previousNonSpace(input: string, before: number): string {
    let index = before - 1;

    while (index >= 0 && /\s/.test(input[index])) {
        index -= 1;
    }

    return index >= 0 ? input[index] : "";
}

function highlightJavaScript(input: string): Token[] {
    const sink = new TokenSink();
    let index = 0;

    while (index < input.length) {
        const char = input[index];

        if (/\s/.test(char)) {
            sink.push("plain", char);
            index += 1;
            continue;
        }

        if (char === "/" && input[index + 1] === "/") {
            const end = input.indexOf("\n", index);
            const stop = end === -1 ? input.length : end;

            sink.push("comment", input.slice(index, stop));
            index = stop;
            continue;
        }

        if (char === "/" && input[index + 1] === "*") {
            const end = input.indexOf("*/", index + 2);
            const stop = end === -1 ? input.length : end + 2;

            sink.push("comment", input.slice(index, stop));
            index = stop;
            continue;
        }

        if (char === "'" || char === '"' || char === "`") {
            // A template's `${…}` is coloured as part of the string. Splitting
            // it would mean tracking nesting for a payload nobody reads that
            // closely, and the invariant matters more than the nicety.
            const end = readQuoted(input, index, char, true);

            sink.push("string", input.slice(index, end));
            index = end;
            continue;
        }

        const number = JS_NUMBER.exec(input.slice(index));

        if (number !== null && /\d/.test(char)) {
            sink.push("number", number[0]);
            index += number[0].length;
            continue;
        }

        const identifier = JS_IDENTIFIER.exec(input.slice(index));

        if (identifier !== null) {
            const text = identifier[0];
            const next = peekNonSpace(input, index + text.length);
            const previous = previousNonSpace(input, index);

            if (JS_KEYWORDS.has(text)) {
                sink.push("keyword", text);
            } else if (JS_CONSTANTS.has(text)) {
                sink.push("number", text);
            } else if (next === "(") {
                sink.push("function", text);
            } else if (previous === "." || next === ":") {
                sink.push("property", text);
            } else {
                sink.push("plain", text);
            }

            index += text.length;
            continue;
        }

        if (JS_PUNCTUATION.has(char)) {
            sink.push("punctuation", char);
            index += 1;
            continue;
        }

        if (JS_OPERATOR.has(char)) {
            sink.push("operator", char);
            index += 1;
            continue;
        }

        sink.push("plain", char);
        index += 1;
    }

    return sink.drain();
}

/* --------------------------------------------------------------- public --- */

/**
 * Above this, the text is left unhighlighted.
 *
 * The input is highlighted on every keystroke and cannot be debounced — the
 * coloured text sits *behind* the textarea, so a settled value would leave the
 * two out of step and the caret in the wrong place for 300 ms. A linear scan of
 * a few thousand characters is nothing; a scan of the 200,000 the input accepts
 * would be felt on every key. Losing the colour is a far smaller loss than
 * losing the typing.
 */
export const MAX_HIGHLIGHT_LENGTH = 20_000;

export function highlight(input: string, language: HighlightLanguage): readonly Token[] {
    if (input.length > MAX_HIGHLIGHT_LENGTH) {
        return [{ kind: "plain", text: input }];
    }

    return language === "shell" ? highlightShell(input) : highlightJavaScript(input);
}
