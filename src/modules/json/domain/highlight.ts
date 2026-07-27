export const JSON_TOKEN_KINDS = [
    "key",
    "string",
    "number",
    "boolean",
    "null",
    "punctuation",
    /** Whitespace and anything the scanner does not claim; inherits its colour. */
    "plain",
] as const;

export type JsonTokenKind = (typeof JSON_TOKEN_KINDS)[number];

export type JsonToken = {
    readonly kind: JsonTokenKind;
    readonly text: string;
};

/**
 * Past this the span count costs more than the colour is worth, so the document
 * renders as one plain run. Nothing is hidden or truncated — it is the same
 * text, monochrome.
 */
export const MAX_HIGHLIGHT_LENGTH = 200_000;

const PUNCTUATION = new Set(["{", "}", "[", "]", ",", ":"]);

const NUMBER_CHAR = /[0-9+\-.eE]/;

const WHITESPACE = /\s/;

const LITERALS = ["true", "false", "null"] as const;

/** Index just past the closing quote, or the end of the input if it is missing. */
function readString(source: string, from: number): number {
    let index = from + 1;

    while (index < source.length) {
        const char = source[index];

        if (char === "\\") {
            index += 2;
            continue;
        }

        if (char === '"') {
            return index + 1;
        }

        index += 1;
    }

    return index;
}

function readNumber(source: string, from: number): number {
    let index = from + 1;

    while (index < source.length && NUMBER_CHAR.test(source[index])) {
        index += 1;
    }

    return index;
}

/** A string is a member name when a colon is the next thing that matters. */
function followedByColon(source: string, from: number): boolean {
    let index = from;

    while (index < source.length && WHITESPACE.test(source[index])) {
        index += 1;
    }

    return source[index] === ":";
}

/**
 * Splits rendered JSON into coloured runs.
 *
 * The input is always output this module produced, so it is well formed; the
 * scanner still degrades to `plain` rather than failing on anything it does not
 * recognise, because a highlighter that throws would take the result panel with
 * it. Consecutive uncoloured characters merge into one token, which keeps the
 * span count proportional to the values rather than to the whitespace.
 */
export function tokenizeJson(source: string): readonly JsonToken[] {
    if (source.length === 0) {
        return [];
    }

    if (source.length > MAX_HIGHLIGHT_LENGTH) {
        return [{ kind: "plain", text: source }];
    }

    const tokens: JsonToken[] = [];
    let plain = "";
    let index = 0;

    function push(kind: JsonTokenKind, text: string): void {
        if (plain.length > 0) {
            tokens.push({ kind: "plain", text: plain });
            plain = "";
        }

        tokens.push({ kind, text });
    }

    while (index < source.length) {
        const char = source[index];

        if (char === '"') {
            const end = readString(source, index);

            push(followedByColon(source, end) ? "key" : "string", source.slice(index, end));
            index = end;
            continue;
        }

        if (PUNCTUATION.has(char)) {
            push("punctuation", char);
            index += 1;
            continue;
        }

        if (char === "-" || (char >= "0" && char <= "9")) {
            const end = readNumber(source, index);

            push("number", source.slice(index, end));
            index = end;
            continue;
        }

        const literal = LITERALS.find((candidate) => source.startsWith(candidate, index));

        if (literal !== undefined) {
            push(literal === "null" ? "null" : "boolean", literal);
            index += literal.length;
            continue;
        }

        plain += char;
        index += 1;
    }

    if (plain.length > 0) {
        tokens.push({ kind: "plain", text: plain });
    }

    return tokens;
}
