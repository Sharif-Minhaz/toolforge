import type {
    JsonAdvisory,
    JsonError,
    JsonErrorCode,
    JsonMember,
    JsonNode,
    JsonPosition,
    JsonRepair,
    JsonRepairCode,
} from "../types";
import { MAX_JSON_DEPTH } from "./constants";

/**
 * A JSON reader written by hand rather than layered over `JSON.parse`.
 *
 * Three things make that worth the lines. `JSON.parse` reports failures through
 * an engine-specific `SyntaxError` message — V8, JavaScriptCore and SpiderMonkey
 * each word it differently and only some of them carry a line and column — so
 * scraping it would give a different answer in every browser. It also has no
 * lenient mode, which the repair pass needs. And it routes every number through
 * a double, which silently rounds any integer past 2^53; keeping the literal as
 * written is the only way a formatter can promise it did not touch your data.
 *
 * Nothing here is React-, locale- or I/O-aware: it takes a string and returns a
 * tree or a typed failure.
 */

export type JsonParseOutcome =
    | {
          readonly ok: true;
          readonly root: JsonNode;
          readonly advisories: readonly JsonAdvisory[];
          readonly repairs: readonly JsonRepair[];
      }
    | { readonly ok: false; readonly error: JsonError };

const BOM = "﻿";

/** JSON's own whitespace. Everything else is a repair. */
const STRICT_WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

const LENIENT_WHITESPACE = /[\s﻿]/;

const DIGIT = /[0-9]/;

const HEX_DIGIT = /[0-9a-fA-F]/;

const WORD_CHAR = /[A-Za-z0-9_$]/;

/** Anything that could plausibly begin a value, used to spot a missing comma. */
const VALUE_START = /[{["'‘’“”\-+.0-9A-Za-z_$]/;

const SIMPLE_ESCAPES: Record<string, string> = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
};

/** Quote characters a word processor or a Python REPL leaves behind. */
const QUOTE_CLOSERS: Record<string, string> = {
    '"': '"',
    "'": "'",
    "‘": "’",
    "’": "’",
    "“": "”",
    "”": "”",
};

/** Words other languages emit that JSON has no room for. */
const NON_STANDARD_LITERALS: Record<string, "true" | "false" | "null"> = {
    True: "true",
    False: "false",
    TRUE: "true",
    FALSE: "false",
    None: "null",
    NULL: "null",
    Null: "null",
    nil: "null",
    undefined: "null",
    NaN: "null",
    Infinity: "null",
};

type Reader = {
    readonly text: string;
    readonly repair: boolean;
    /** UTF-16 index; every structural character in JSON is ASCII. */
    index: number;
    line: number;
    column: number;
    offset: number;
    depth: number;
    readonly advisories: JsonAdvisory[];
    readonly repairs: JsonRepair[];
};

/**
 * Thrown to unwind out of a nested parse and caught by `parseJson`, which is the
 * only place it can escape to. The exported contract is still a typed union —
 * this is control flow inside one module, not an error a caller has to catch.
 */
class ParseFailure extends Error {
    readonly failure: JsonError;

    constructor(failure: JsonError) {
        super(failure.code);
        this.name = "ParseFailure";
        this.failure = failure;
    }
}

/* ---------------------------------------------------------------- reader --- */

function at(reader: Reader): JsonPosition {
    return { line: reader.line, column: reader.column, offset: reader.offset };
}

function done(reader: Reader): boolean {
    return reader.index >= reader.text.length;
}

/** The current UTF-16 unit, or `""` at the end of the input. */
function current(reader: Reader): string {
    return reader.text[reader.index] ?? "";
}

/** The current character as a person sees it, surrogate pair included. */
function currentCharacter(reader: Reader): string {
    const code = reader.text.codePointAt(reader.index);

    return code === undefined ? "" : String.fromCodePoint(code);
}

/**
 * Consumes one whole code point. Columns are counted in characters rather than
 * UTF-16 units, so an emoji earlier in the line does not push every later
 * column along by one.
 */
function advance(reader: Reader): void {
    const code = reader.text.codePointAt(reader.index);

    if (code === undefined) {
        return;
    }

    reader.index += code > 0xffff ? 2 : 1;
    reader.offset += 1;

    // CR only starts a line when it stands alone; in CRLF the LF does the work.
    if (code === 0x0a || (code === 0x0d && reader.text[reader.index] !== "\n")) {
        reader.line += 1;
        reader.column = 1;
    } else {
        reader.column += 1;
    }
}

type FailOptions = {
    readonly at?: JsonPosition;
    readonly found?: string;
    readonly expected?: string;
};

function fail(reader: Reader, code: JsonErrorCode, options: FailOptions = {}): never {
    const position = options.at ?? at(reader);
    const found = options.found ?? (done(reader) ? undefined : currentCharacter(reader));

    throw new ParseFailure({ code, ...position, found, expected: options.expected });
}

function noteRepair(reader: Reader, code: JsonRepairCode, position: JsonPosition): void {
    reader.repairs.push({ code, ...position });
}

/** Reads an identifier-shaped word without consuming it. */
function peekWord(reader: Reader, from: number = reader.index): string {
    let index = from;
    let word = "";

    while (index < reader.text.length && WORD_CHAR.test(reader.text[index])) {
        word += reader.text[index];
        index += 1;
    }

    return word;
}

/** Words are ASCII, so one `advance` per character is exact. */
function consumeWord(reader: Reader, word: string): void {
    for (let index = 0; index < word.length; index += 1) {
        advance(reader);
    }
}

/* ---------------------------------------------------------------- trivia --- */

function skipComment(reader: Reader): void {
    const start = at(reader);
    const marker = reader.text[reader.index + 1];

    if (!reader.repair) {
        fail(reader, "comment", { at: start });
    }

    noteRepair(reader, "comment", start);
    advance(reader);
    advance(reader);

    if (marker === "/") {
        while (!done(reader) && current(reader) !== "\n") {
            advance(reader);
        }

        return;
    }

    // An unterminated block comment simply swallows the rest of the input; the
    // value parser then reports the truncation, which is the real problem.
    while (!done(reader)) {
        if (current(reader) === "*" && reader.text[reader.index + 1] === "/") {
            advance(reader);
            advance(reader);

            return;
        }

        advance(reader);
    }
}

function skipTrivia(reader: Reader): void {
    for (;;) {
        while (!done(reader)) {
            const char = current(reader);
            const whitespace = reader.repair
                ? LENIENT_WHITESPACE.test(char)
                : STRICT_WHITESPACE.has(char);

            if (!whitespace) {
                break;
            }

            advance(reader);
        }

        const marker = reader.text[reader.index + 1];

        // A lone slash is not a comment; let the caller name it instead.
        if (current(reader) !== "/" || (marker !== "/" && marker !== "*")) {
            return;
        }

        skipComment(reader);
    }
}

/* --------------------------------------------------------------- strings --- */

/** The index of the first surrogate without a partner, if there is one. */
function findLoneSurrogate(value: string): number | undefined {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);

        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1);

            if (next >= 0xdc00 && next <= 0xdfff) {
                index += 1;
                continue;
            }

            return index;
        }

        if (code >= 0xdc00 && code <= 0xdfff) {
            return index;
        }
    }

    return undefined;
}

function readEscape(reader: Reader): string {
    const start = at(reader);

    advance(reader);

    if (done(reader)) {
        fail(reader, "unterminated_string");
    }

    const marker = current(reader);

    if (marker === "u") {
        advance(reader);

        let hex = "";

        for (let digit = 0; digit < 4; digit += 1) {
            if (done(reader) || !HEX_DIGIT.test(current(reader))) {
                fail(reader, "invalid_escape", { at: start });
            }

            hex += current(reader);
            advance(reader);
        }

        // A half of a surrogate pair is kept as-is; the caller reports it.
        return String.fromCharCode(Number.parseInt(hex, 16));
    }

    const mapped = SIMPLE_ESCAPES[marker];

    if (mapped !== undefined) {
        advance(reader);

        return mapped;
    }

    if (!reader.repair) {
        fail(reader, "invalid_escape", { at: start, found: `\\${marker}` });
    }

    noteRepair(reader, "invalid_escape", start);

    // `\'` and the like: the backslash was never needed, so drop just that.
    const literal = currentCharacter(reader);

    advance(reader);

    return literal;
}

type ParsedString = {
    readonly value: string;
    readonly at: JsonPosition;
};

function parseString(reader: Reader): ParsedString {
    const start = at(reader);
    const opener = current(reader);
    const closer = QUOTE_CLOSERS[opener];

    if (closer === undefined) {
        fail(reader, "unexpected_token", { expected: '"' });
    }

    if (opener !== '"') {
        if (!reader.repair) {
            fail(reader, "non_standard_quote", { at: start });
        }

        noteRepair(reader, "non_standard_quote", start);
    }

    advance(reader);

    let value = "";

    for (;;) {
        if (done(reader)) {
            fail(reader, "unterminated_string", { at: start });
        }

        const char = current(reader);

        if (char === closer) {
            advance(reader);
            break;
        }

        if (char === "\\") {
            value += readEscape(reader);
            continue;
        }

        if (char.charCodeAt(0) < 0x20) {
            // A raw newline or tab inside a string is illegal JSON; repair
            // keeps the character and the serialiser escapes it on the way out.
            if (!reader.repair) {
                fail(reader, "control_character");
            }

            noteRepair(reader, "control_character", at(reader));
            value += char;
            advance(reader);
            continue;
        }

        value += currentCharacter(reader);
        advance(reader);
    }

    if (findLoneSurrogate(value) !== undefined) {
        reader.advisories.push({ code: "unpaired_surrogate", ...start });
    }

    return { value, at: start };
}

/* --------------------------------------------------------------- numbers --- */

function readDigits(reader: Reader): string {
    let digits = "";

    while (!done(reader) && DIGIT.test(current(reader))) {
        digits += current(reader);
        advance(reader);
    }

    return digits;
}

/**
 * Whether a `JSON.parse` consumer would get a different value back than the
 * literal says. Only integers are compared exactly — every decimal fraction is
 * approximated by a double, so flagging those would be noise rather than news.
 */
export function losesPrecision(raw: string): boolean {
    const value = Number(raw);

    if (!Number.isFinite(value)) {
        return true;
    }

    if (value === 0 && /[1-9]/.test(raw)) {
        return true;
    }

    if (!/^-?\d+$/.test(raw) || !Number.isInteger(value)) {
        return false;
    }

    return BigInt(raw) !== BigInt(value);
}

function parseNumber(reader: Reader): JsonNode {
    const start = at(reader);
    let flagged = false;

    /** One number earns at most one repair note, however many parts were off. */
    function flag(): void {
        if (!reader.repair) {
            fail(reader, "invalid_number", { at: start });
        }

        if (!flagged) {
            flagged = true;
            noteRepair(reader, "invalid_number", start);
        }
    }

    let sign = "";

    if (current(reader) === "+") {
        flag();
        advance(reader);
    } else if (current(reader) === "-") {
        sign = "-";
        advance(reader);
    }

    const hexMarker = reader.text[reader.index + 1];

    if (current(reader) === "0" && (hexMarker === "x" || hexMarker === "X")) {
        flag();
        advance(reader);
        advance(reader);

        let hex = "";

        while (!done(reader) && HEX_DIGIT.test(current(reader))) {
            hex += current(reader);
            advance(reader);
        }

        if (hex === "") {
            fail(reader, "invalid_number", { at: start });
        }

        return { kind: "number", at: start, raw: `${sign}${Number.parseInt(hex, 16)}` };
    }

    let integer = readDigits(reader);

    if (integer.length > 1 && integer.startsWith("0")) {
        flag();
        integer = integer.replace(/^0+(?=\d)/, "");
    }

    if (integer === "") {
        // `.5` is only recoverable if a fraction actually follows.
        if (current(reader) !== ".") {
            fail(reader, "invalid_number", { at: start });
        }

        flag();
        integer = "0";
    }

    let fraction = "";

    if (current(reader) === ".") {
        advance(reader);
        fraction = readDigits(reader);

        if (fraction === "") {
            flag();
        }
    }

    let exponent = "";

    if (current(reader) === "e" || current(reader) === "E") {
        // Both the marker's case and an explicit `+` are valid JSON, so they
        // are carried through rather than normalised away.
        const marker = current(reader);

        advance(reader);

        let exponentSign = "";

        if (current(reader) === "+" || current(reader) === "-") {
            exponentSign = current(reader);
            advance(reader);
        }

        const digits = readDigits(reader);

        if (digits === "") {
            flag();
        } else {
            exponent = `${marker}${exponentSign}${digits}`;
        }
    }

    const raw = `${sign}${integer}${fraction === "" ? "" : `.${fraction}`}${exponent}`;

    if (losesPrecision(raw)) {
        reader.advisories.push({ code: "precision_loss", literal: raw, ...start });
    }

    return { kind: "number", at: start, raw };
}

/* -------------------------------------------------------------- literals --- */

function nonStandardNode(replacement: "true" | "false" | "null", start: JsonPosition): JsonNode {
    if (replacement === "null") {
        return { kind: "null", at: start };
    }

    return { kind: "boolean", at: start, value: replacement === "true" };
}

function parseWordValue(reader: Reader): JsonNode {
    const start = at(reader);
    const word = peekWord(reader);

    if (word === "true" || word === "false") {
        consumeWord(reader, word);

        return { kind: "boolean", at: start, value: word === "true" };
    }

    if (word === "null") {
        consumeWord(reader, word);

        return { kind: "null", at: start };
    }

    const replacement = NON_STANDARD_LITERALS[word];

    if (replacement !== undefined) {
        if (!reader.repair) {
            fail(reader, "non_standard_literal", { at: start, found: word });
        }

        noteRepair(reader, "non_standard_literal", start);
        consumeWord(reader, word);

        return nonStandardNode(replacement, start);
    }

    if (word === "") {
        fail(reader, "unexpected_token");
    }

    fail(reader, "invalid_literal", { at: start, found: word });
}

/* ------------------------------------------------------------ containers --- */

function enterContainer(reader: Reader): void {
    reader.depth += 1;

    if (reader.depth > MAX_JSON_DEPTH) {
        fail(reader, "too_deep");
    }
}

function startsKey(reader: Reader): boolean {
    return QUOTE_CLOSERS[current(reader)] !== undefined || peekWord(reader) !== "";
}

function startsValue(reader: Reader): boolean {
    return !done(reader) && VALUE_START.test(current(reader));
}

function readKey(reader: Reader): ParsedString {
    if (QUOTE_CLOSERS[current(reader)] !== undefined) {
        return parseString(reader);
    }

    const start = at(reader);
    const word = peekWord(reader);

    if (word === "") {
        fail(reader, done(reader) ? "unexpected_end" : "unexpected_token", { expected: '"' });
    }

    if (!reader.repair) {
        fail(reader, "unquoted_key", { at: start, found: word });
    }

    noteRepair(reader, "unquoted_key", start);
    consumeWord(reader, word);

    return { value: word, at: start };
}

function parseObject(reader: Reader): JsonNode {
    const start = at(reader);

    enterContainer(reader);
    advance(reader);

    const members: JsonMember[] = [];
    const seen = new Set<string>();

    skipTrivia(reader);

    if (current(reader) === "}") {
        advance(reader);
        reader.depth -= 1;

        return { kind: "object", at: start, members };
    }

    for (;;) {
        skipTrivia(reader);

        const key = readKey(reader);

        if (seen.has(key.value)) {
            reader.advisories.push({ code: "duplicate_key", key: key.value, ...key.at });
        } else {
            seen.add(key.value);
        }

        skipTrivia(reader);

        if (current(reader) !== ":") {
            fail(reader, done(reader) ? "unexpected_end" : "unexpected_token", { expected: ":" });
        }

        advance(reader);
        members.push({ key: key.value, at: key.at, value: parseValue(reader) });
        skipTrivia(reader);

        if (current(reader) === ",") {
            const comma = at(reader);

            advance(reader);
            skipTrivia(reader);

            if (current(reader) !== "}") {
                continue;
            }

            if (!reader.repair) {
                fail(reader, "trailing_comma", { at: comma, found: "," });
            }

            noteRepair(reader, "trailing_comma", comma);
            advance(reader);
            break;
        }

        if (current(reader) === "}") {
            advance(reader);
            break;
        }

        if (done(reader)) {
            fail(reader, "unexpected_end", { expected: "}" });
        }

        if (!startsKey(reader)) {
            fail(reader, "unexpected_token", { expected: "," });
        }

        if (!reader.repair) {
            fail(reader, "missing_comma", { expected: "," });
        }

        noteRepair(reader, "missing_comma", at(reader));
    }

    reader.depth -= 1;

    return { kind: "object", at: start, members };
}

function parseArray(reader: Reader): JsonNode {
    const start = at(reader);

    enterContainer(reader);
    advance(reader);

    const items: JsonNode[] = [];

    skipTrivia(reader);

    if (current(reader) === "]") {
        advance(reader);
        reader.depth -= 1;

        return { kind: "array", at: start, items };
    }

    for (;;) {
        items.push(parseValue(reader));
        skipTrivia(reader);

        if (current(reader) === ",") {
            const comma = at(reader);

            advance(reader);
            skipTrivia(reader);

            if (current(reader) !== "]") {
                continue;
            }

            if (!reader.repair) {
                fail(reader, "trailing_comma", { at: comma, found: "," });
            }

            noteRepair(reader, "trailing_comma", comma);
            advance(reader);
            break;
        }

        if (current(reader) === "]") {
            advance(reader);
            break;
        }

        if (done(reader)) {
            fail(reader, "unexpected_end", { expected: "]" });
        }

        if (!startsValue(reader)) {
            fail(reader, "unexpected_token", { expected: "," });
        }

        if (!reader.repair) {
            fail(reader, "missing_comma", { expected: "," });
        }

        noteRepair(reader, "missing_comma", at(reader));
    }

    reader.depth -= 1;

    return { kind: "array", at: start, items };
}

/* ---------------------------------------------------------------- values --- */

function parseValue(reader: Reader): JsonNode {
    skipTrivia(reader);

    if (done(reader)) {
        fail(reader, "unexpected_end");
    }

    const char = current(reader);

    if (char === "{") {
        return parseObject(reader);
    }

    if (char === "[") {
        return parseArray(reader);
    }

    if (QUOTE_CLOSERS[char] !== undefined) {
        const parsed = parseString(reader);

        return { kind: "string", at: parsed.at, value: parsed.value };
    }

    // `-Infinity` is not JSON, but plenty of serialisers emit it anyway.
    if (char === "-" && peekWord(reader, reader.index + 1) === "Infinity") {
        const start = at(reader);

        if (!reader.repair) {
            fail(reader, "non_standard_literal", { at: start, found: "-Infinity" });
        }

        noteRepair(reader, "non_standard_literal", start);
        advance(reader);
        consumeWord(reader, "Infinity");

        return { kind: "null", at: start };
    }

    if (char === "-" || char === "+" || char === "." || DIGIT.test(char)) {
        return parseNumber(reader);
    }

    return parseWordValue(reader);
}

/* ------------------------------------------------------------------ root --- */

export function parseJson(input: string, repair: boolean): JsonParseOutcome {
    // RFC 8259 §8.1 lets an implementation ignore a leading byte order mark, and
    // ignoring it is kinder than failing on an artefact of how a file was saved.
    const text = input.startsWith(BOM) ? input.slice(BOM.length) : input;

    const reader: Reader = {
        text,
        repair,
        index: 0,
        line: 1,
        column: 1,
        offset: 0,
        depth: 0,
        advisories: [],
        repairs: [],
    };

    try {
        skipTrivia(reader);

        // "Nothing to read" is about the document, not a spot inside it, so it
        // points at the start rather than at wherever the whitespace ran out.
        if (done(reader)) {
            return { ok: false, error: { code: "empty", line: 1, column: 1, offset: 0 } };
        }

        const root = parseValue(reader);

        skipTrivia(reader);

        if (!done(reader)) {
            fail(reader, "trailing_content");
        }

        return { ok: true, root, advisories: reader.advisories, repairs: reader.repairs };
    } catch (caught) {
        if (caught instanceof ParseFailure) {
            return { ok: false, error: caught.failure };
        }

        throw caught;
    }
}
