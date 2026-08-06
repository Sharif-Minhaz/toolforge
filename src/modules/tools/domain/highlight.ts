/**
 * Tokenizers for *display*, not for meaning.
 *
 * A tool that reads a language usually already has a parser for it, and that
 * parser is the wrong tool for this: it resolves escapes, discards quotes and
 * normalises whitespace, because it is working out what the text *means*.
 * Highlighting has the opposite requirement — every character of the input must
 * come back out, quotes and backslashes included, in the order it was written.
 * The text is painted *behind* a transparent textarea, so a single character
 * lost or added shifts every glyph after it and the caret stops landing where
 * it points.
 *
 * That requirement is the invariant the tests hold every language to:
 * `tokens.map((token) => token.text).join("") === input`, for any input at all.
 * It is why each of these is a hand-written scanner that always advances and
 * never throws — an unterminated string or a stray brace has to colour badly
 * rather than fail, because it is what somebody halfway through typing has.
 *
 * Lifted out of the cURL module, whole, the moment a second tool needed it.
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

/**
 * `plain` is a real member rather than an absence, so a caller whose notation
 * has no structure worth colouring — base64, a digest — passes a value instead
 * of branching around the component.
 */
export const HIGHLIGHT_LANGUAGES = [
    "shell",
    "javascript",
    "json",
    "graphql",
    "toon",
    "hex",
    "plain",
] as const;

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

/* -------------------------------------------------------------- graphql --- */

const GRAPHQL_KEYWORD =
    /^(?:query|mutation|subscription|fragment|on|type|input|enum|interface|union|scalar|schema|extend|implements|directive|repeatable|true|false|null)\b/;

const GRAPHQL_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;

const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*/;

const GRAPHQL_PUNCTUATION = new Set(["{", "}", "(", ")", "[", "]", ":", ",", "=", "!", "|", "&"]);

/**
 * GraphQL, for the SDL panel and the query editor.
 *
 * Three things distinguish it from the JSON scanner it otherwise resembles, and
 * each is a real feature of the grammar rather than decoration:
 *
 * - **Block strings.** `"""…"""` is how every description in a generated schema
 *   is written, and reading one as three empty strings would mis-colour the
 *   entire rest of the file. It is checked before the single-quote case, which
 *   is the only order that works.
 * - **A name before a colon is a field or an argument**, and one after it is a
 *   type. Looking ahead for the colon is the same trick the JSON scanner uses
 *   for keys, and it is what makes an SDL readable at a glance.
 * - **`$` and `@` lead their own tokens.** A variable and a directive are the
 *   two things in a query that are neither a field nor a literal, and both are
 *   worth seeing.
 *
 * Like every scanner here it always advances and never throws: an unterminated
 * block string or a stray brace colours badly rather than failing, because that
 * is what somebody halfway through typing has.
 */
function highlightGraphql(input: string): Token[] {
    const sink = new TokenSink();
    let index = 0;

    while (index < input.length) {
        const character = input[index];

        if (/\s/.test(character)) {
            sink.push("plain", character);
            index += 1;
            continue;
        }

        if (character === "#") {
            const end = input.indexOf("\n", index);
            const stop = end < 0 ? input.length : end;

            sink.push("comment", input.slice(index, stop));
            index = stop;
            continue;
        }

        // Before the single-quote case, or `"""` reads as an empty string
        // followed by a quote that swallows the rest of the document.
        if (input.startsWith('"""', index)) {
            const end = input.indexOf('"""', index + 3);
            const stop = end < 0 ? input.length : end + 3;

            sink.push("string", input.slice(index, stop));
            index = stop;
            continue;
        }

        if (character === '"') {
            const end = readQuoted(input, index, '"', true);

            sink.push("string", input.slice(index, end));
            index = end;
            continue;
        }

        if (character === "$" || character === "@") {
            const name = GRAPHQL_NAME.exec(input.slice(index + 1));
            const text = name === null ? character : `${character}${name[0]}`;

            sink.push(character === "$" ? "flag" : "function", text);
            index += text.length;
            continue;
        }

        if (input.startsWith("...", index)) {
            sink.push("operator", "...");
            index += 3;
            continue;
        }

        if (GRAPHQL_PUNCTUATION.has(character)) {
            sink.push("punctuation", character);
            index += 1;
            continue;
        }

        const rest = input.slice(index);
        const keyword = GRAPHQL_KEYWORD.exec(rest);

        if (keyword !== null) {
            sink.push("keyword", keyword[0]);
            index += keyword[0].length;
            continue;
        }

        const number = GRAPHQL_NUMBER.exec(rest);

        if (number !== null) {
            sink.push("number", number[0]);
            index += number[0].length;
            continue;
        }

        const name = GRAPHQL_NAME.exec(rest);

        if (name !== null) {
            sink.push(
                peekNonSpace(input, index + name[0].length) === ":" ? "property" : "plain",
                name[0],
            );
            index += name[0].length;
            continue;
        }

        // Anything else is somebody mid-keystroke. One character at a time keeps
        // the scan advancing whatever it meets.
        sink.push("plain", character);
        index += 1;
    }

    return sink.drain();
}

/* ----------------------------------------------------------------- json --- */

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const JSON_LITERAL = /^(?:true|false|null)/;
const JSON_PUNCTUATION = new Set(["{", "}", "[", "]", ",", ":"]);

/**
 * A JSON string is a key or a value depending on what comes *after* it, so the
 * colon has to be looked ahead to. Extended JSON leans on that hard: half the
 * keys a reader of this site sees are `$oid` and `$numberLong`, and colouring
 * them as values would make a BSON document unreadable at a glance.
 */
function highlightJson(input: string): Token[] {
    const sink = new TokenSink();
    let index = 0;

    while (index < input.length) {
        const character = input[index];

        if (/\s/.test(character)) {
            sink.push("plain", character);
            index += 1;
            continue;
        }

        if (character === '"') {
            const end = readQuoted(input, index, '"', true);
            const text = input.slice(index, end);

            sink.push(peekNonSpace(input, end) === ":" ? "property" : "string", text);
            index = end;
            continue;
        }

        if (JSON_PUNCTUATION.has(character)) {
            sink.push("punctuation", character);
            index += 1;
            continue;
        }

        const rest = input.slice(index);
        const literal = JSON_LITERAL.exec(rest);

        if (literal !== null) {
            sink.push("keyword", literal[0]);
            index += literal[0].length;
            continue;
        }

        const number = JSON_NUMBER.exec(rest);

        if (number !== null) {
            sink.push("number", number[0]);
            index += number[0].length;
            continue;
        }

        // Anything else is somebody mid-keystroke, or JSON this is not. One
        // character at a time keeps the scan advancing whatever it meets.
        sink.push("plain", character);
        index += 1;
    }

    return sink.drain();
}

/* ----------------------------------------------------------------- toon --- */

const TOON_LITERAL = /^(?:true|false|null)$/;
const TOON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
// `key:`, `key[3]:`, `key[3|]{a|b}:` — the header up to and including the
// colon. TOON's structure lives entirely on the left of that colon, which is
// what makes a line-oriented scanner enough here.
const TOON_HEADER = /^(\s*)(-\s+)?("(?:[^"\\]|\\.)*"|[^\s:[{]+)(\[[^\]]*\])?(\{[^}]*\})?(:)/;

/** Splits a `[3|]` or `{a|b}` group into its brackets, names and delimiters. */
function pushToonGroup(sink: TokenSink, group: string, inner: TokenKind): void {
    sink.push("punctuation", group[0]);

    for (const part of group.slice(1, -1).split(/([,|\t:])/)) {
        if (part.length === 0) {
            continue;
        }

        if (/^[,|\t:]$/.test(part)) {
            sink.push("punctuation", part);
        } else {
            sink.push(/^\d+$/.test(part) ? "number" : inner, part);
        }
    }

    sink.push("punctuation", group[group.length - 1]);
}

const TOON_DELIMITER = /[,|\t]/;

/**
 * Colours the values after a header's colon, the way a JSON scalar is coloured.
 *
 * Scanned rather than split, because a quoted value may *contain* the
 * delimiter — that is the entire reason TOON quotes anything. Splitting on the
 * delimiter first cuts `"a, b"` into `"a` and ` b"` and loses the string.
 */
function pushToonValue(sink: TokenSink, text: string): void {
    let index = 0;

    while (index < text.length) {
        const character = text[index];

        if (character === '"') {
            const end = readQuoted(text, index, '"', true);

            sink.push("string", text.slice(index, end));
            index = end;
            continue;
        }

        if (TOON_DELIMITER.test(character) || character === " ") {
            sink.push(TOON_DELIMITER.test(character) ? "punctuation" : "plain", character);
            index += 1;
            continue;
        }

        let end = index;

        while (
            end < text.length &&
            text[end] !== '"' &&
            text[end] !== " " &&
            !TOON_DELIMITER.test(text[end])
        ) {
            end += 1;
        }

        const run = text.slice(index, end);

        sink.push(
            TOON_LITERAL.test(run) ? "keyword" : TOON_NUMBER.test(run) ? "number" : "plain",
            run,
        );
        index = end;
    }
}

/**
 * TOON is line-oriented and indentation-structured, so this scans a line at a
 * time rather than a character at a time. The header regex either matches the
 * whole `key[3]{a,b}:` prefix or it does not; a line it cannot read is a row of
 * values, which is exactly what an unmatched line is.
 */
function highlightToon(input: string): Token[] {
    const sink = new TokenSink();

    for (const [index, line] of input.split("\n").entries()) {
        if (index > 0) {
            sink.push("plain", "\n");
        }

        const indent = line.slice(0, line.length - line.trimStart().length);

        // A full-line `#` comment is stripped on decode, so hand-annotated
        // prompt data survives a round trip. Colour it like one.
        if (line.trimStart().startsWith("#")) {
            sink.push("plain", indent);
            sink.push("comment", line.slice(indent.length));
            continue;
        }

        const header = TOON_HEADER.exec(line);

        if (header === null) {
            const marker = /^(\s*)(-\s+)/.exec(line);

            if (marker !== null) {
                sink.push("plain", marker[1]);
                sink.push("punctuation", marker[2]);
                pushToonValue(sink, line.slice(marker[0].length));
                continue;
            }

            pushToonValue(sink, line);
            continue;
        }

        const [matched, lead, dash, key, length, fields, colon] = header;

        sink.push("plain", lead);

        if (dash !== undefined) {
            sink.push("punctuation", dash);
        }

        sink.push("property", key);

        if (length !== undefined) {
            pushToonGroup(sink, length, "number");
        }

        if (fields !== undefined) {
            pushToonGroup(sink, fields, "property");
        }

        sink.push("punctuation", colon);
        pushToonValue(sink, line.slice(matched.length));
    }

    return sink.drain();
}

/* ------------------------------------------------------------------ hex --- */

/** A BSON document opens with its own length as a little-endian int32. */
const BSON_LENGTH_DIGITS = 8;
const ALL_HEX = /^[0-9a-f]*$/i;

/**
 * Hex has no syntax, so there is nothing to colour — except the two parts of a
 * BSON dump that a reader actually has to find. The first four bytes are the
 * document's declared length, which is the number the "header declares N bytes"
 * failure is about, and the last byte is the terminator. Marking those two
 * turns an undifferentiated wall of digits into something with ends.
 *
 * Everything else, including any string that is not a plausible document, is
 * one plain token: guessing structure out of hex that has none would colour
 * noise.
 */
function highlightHex(input: string): Token[] {
    const compact = input.replace(/\s+/g, "");

    if (compact.length < BSON_LENGTH_DIGITS + 2 || !ALL_HEX.test(compact)) {
        return input.length === 0 ? [] : [{ kind: "plain", text: input }];
    }

    const sink = new TokenSink();
    let seen = 0;

    for (const character of input) {
        if (/\s/.test(character)) {
            sink.push("plain", character);
            continue;
        }

        const isLength = seen < BSON_LENGTH_DIGITS;
        const isTerminator = seen >= compact.length - 2;

        sink.push(isLength ? "number" : isTerminator ? "punctuation" : "plain", character);
        seen += 1;
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
    if (input.length === 0) {
        return [];
    }

    if (input.length > MAX_HIGHLIGHT_LENGTH || language === "plain") {
        return [{ kind: "plain", text: input }];
    }

    switch (language) {
        case "shell":
            return highlightShell(input);
        case "javascript":
            return highlightJavaScript(input);
        case "json":
            return highlightJson(input);
        case "graphql":
            return highlightGraphql(input);
        case "toon":
            return highlightToon(input);
        case "hex":
            return highlightHex(input);
    }
}
