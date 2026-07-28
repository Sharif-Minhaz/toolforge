import type {
    ControlEscapeName,
    RegexGroupInfo,
    RegexNode,
    RegexNodeKind,
    RegexQuantifier,
} from "../types";

/**
 * A total recursive-descent parser for ECMAScript regular expressions.
 *
 * It never fails. Anything it does not recognise becomes an `unknown` node and
 * keeps its span, so the highlighter still covers the whole pattern and the
 * explanation still describes everything around the odd bit. Deciding whether a
 * pattern is *valid* is `new RegExp`'s job, not this parser's — duplicating
 * that judgement here would only produce a second, subtly different opinion.
 */

export type ParsedPattern = {
    readonly root: RegexNode;
    readonly groups: readonly RegexGroupInfo[];
};

export type ParseOptions = {
    /** The `x` flag, under which unescaped whitespace and `#` runs are inert. */
    readonly extended?: boolean;
};

type Cursor = {
    readonly pattern: string;
    readonly extended: boolean;
    index: number;
    groupCount: number;
    readonly groups: RegexGroupInfo[];
};

const SHORTHAND_LETTERS = "dDwWsS";

const CONTROL_ESCAPES: Record<string, { name: ControlEscapeName; char: string }> = {
    n: { name: "newline", char: "\n" },
    r: { name: "carriageReturn", char: "\r" },
    t: { name: "tab", char: "\t" },
    f: { name: "formFeed", char: "\f" },
    v: { name: "verticalTab", char: "\v" },
    "0": { name: "nul", char: "\0" },
};

/** `\cJ` and friends: the letter's low five bits are the control code. */
const CONTROL_LETTER = "control";

const QUANTIFIER_BRACE = /^\{(\d+)(?:,(\d*))?\}/;

const INLINE_MODIFIERS = /^\?([a-zA-Z-]+)[:)]/;

const HEX_DIGITS = /^[0-9a-fA-F]+$/;

function at(cursor: Cursor, offset = 0): string {
    return cursor.pattern[cursor.index + offset] ?? "";
}

function done(cursor: Cursor): boolean {
    return cursor.index >= cursor.pattern.length;
}

function node(
    kind: RegexNodeKind,
    start: number,
    end: number,
    extra: Partial<RegexNode> = {},
): RegexNode {
    return { kind, start, end, ...extra };
}

/* ------------------------------------------------------------- quantifiers --- */

function parseQuantifier(cursor: Cursor): RegexQuantifier | undefined {
    const start = cursor.index;
    const character = at(cursor);

    let min: number;
    let max: number | null;

    if (character === "*") {
        min = 0;
        max = null;
        cursor.index += 1;
    } else if (character === "+") {
        min = 1;
        max = null;
        cursor.index += 1;
    } else if (character === "?") {
        min = 0;
        max = 1;
        cursor.index += 1;
    } else if (character === "{") {
        const braced = QUANTIFIER_BRACE.exec(cursor.pattern.slice(cursor.index));

        // A `{` that does not spell a counted repetition is an ordinary
        // character, exactly as the engine reads it.
        if (braced === null) {
            return undefined;
        }

        min = Number(braced[1]);
        max = braced[2] === undefined ? min : braced[2] === "" ? null : Number(braced[2]);
        cursor.index += braced[0].length;
    } else {
        return undefined;
    }

    let greedy = true;
    let possessive = false;

    if (at(cursor) === "?") {
        greedy = false;
        cursor.index += 1;
    } else if (at(cursor) === "+") {
        // PCRE's possessive form. ECMAScript has no such quantifier; the lint
        // pass reports it before the pattern ever reaches `new RegExp`.
        possessive = true;
        cursor.index += 1;
    }

    return { min, max, greedy, possessive, start, end: cursor.index };
}

/* ----------------------------------------------------------------- escapes --- */

/** Positioned on `{`; returns the contents and consumes through `}`. */
function readBraced(cursor: Cursor): string {
    const close = cursor.pattern.indexOf("}", cursor.index);

    if (close === -1) {
        const rest = cursor.pattern.slice(cursor.index + 1);
        cursor.index = cursor.pattern.length;

        return rest;
    }

    const contents = cursor.pattern.slice(cursor.index + 1, close);
    cursor.index = close + 1;

    return contents;
}

function readDelimitedName(cursor: Cursor, open: string, close: string): string {
    if (at(cursor) !== open) {
        return "";
    }

    const end = cursor.pattern.indexOf(close, cursor.index);

    if (end === -1) {
        const rest = cursor.pattern.slice(cursor.index + 1);
        cursor.index = cursor.pattern.length;

        return rest;
    }

    const name = cursor.pattern.slice(cursor.index + 1, end);
    cursor.index = end + 1;

    return name;
}

function readFixedHex(cursor: Cursor, count: number): string {
    const hex = cursor.pattern.slice(cursor.index, cursor.index + count);
    cursor.index += hex.length;

    return hex;
}

function fromCodePoint(hex: string): string {
    if (hex.length === 0 || !HEX_DIGITS.test(hex)) {
        return "";
    }

    const code = Number.parseInt(hex, 16);

    return code > 0x10ffff ? "" : String.fromCodePoint(code);
}

function parseEscape(cursor: Cursor, inClass: boolean): RegexNode {
    const start = cursor.index;
    cursor.index += 1;

    if (done(cursor)) {
        return node("unknown", start, cursor.index);
    }

    const character = at(cursor);
    cursor.index += 1;

    if (SHORTHAND_LETTERS.includes(character)) {
        return node("shorthand", start, cursor.index, {
            detail: character.toLowerCase(),
            negated: character !== character.toLowerCase(),
        });
    }

    // `\b` is a word boundary in a pattern and a backspace inside a class.
    if (character === "b" && inClass) {
        return node("controlEscape", start, cursor.index, { detail: "backspace", value: "\b" });
    }

    if ((character === "b" || character === "B") && !inClass) {
        return node("wordBoundary", start, cursor.index, { negated: character === "B" });
    }

    if (character === "p" || character === "P") {
        const property = at(cursor) === "{" ? readBraced(cursor) : "";

        return node("unicodeProperty", start, cursor.index, {
            detail: property,
            negated: character === "P",
        });
    }

    if (character === "k" && !inClass) {
        return node("namedBackreference", start, cursor.index, {
            detail: readDelimitedName(cursor, "<", ">"),
        });
    }

    const control = CONTROL_ESCAPES[character];

    if (control !== undefined) {
        return node("controlEscape", start, cursor.index, {
            detail: control.name,
            value: control.char,
        });
    }

    if (character === "x") {
        const hex = readFixedHex(cursor, 2);

        return node("hexEscape", start, cursor.index, { detail: hex, value: fromCodePoint(hex) });
    }

    if (character === "u") {
        const hex = at(cursor) === "{" ? readBraced(cursor) : readFixedHex(cursor, 4);

        return node("unicodeEscape", start, cursor.index, {
            detail: hex,
            value: fromCodePoint(hex),
        });
    }

    if (character === "c" && /[a-zA-Z]/.test(at(cursor))) {
        const letter = at(cursor);
        cursor.index += 1;

        return node("controlEscape", start, cursor.index, {
            detail: CONTROL_LETTER,
            value: letter,
        });
    }

    if (!inClass && character >= "1" && character <= "9") {
        let digits = character;

        while (/[0-9]/.test(at(cursor))) {
            digits += at(cursor);
            cursor.index += 1;
        }

        return node("backreference", start, cursor.index, { detail: digits });
    }

    return node("escapedLiteral", start, cursor.index, { value: character });
}

/* --------------------------------------------------------- character class --- */

function parseClassMember(cursor: Cursor): RegexNode {
    if (at(cursor) === "\\") {
        return parseEscape(cursor, true);
    }

    const start = cursor.index;
    const codePoint = cursor.pattern.codePointAt(cursor.index);
    cursor.index += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;

    return node("literal", start, cursor.index, {
        value: cursor.pattern.slice(start, cursor.index),
    });
}

function parseCharacterClass(cursor: Cursor): RegexNode {
    const start = cursor.index;
    cursor.index += 1;

    const negated = at(cursor) === "^";

    if (negated) {
        cursor.index += 1;
    }

    const children: RegexNode[] = [];

    while (!done(cursor) && at(cursor) !== "]") {
        const member = parseClassMember(cursor);
        // `a-z` is a range. A `-` that trails the class, as in `[a-]`, or one
        // that follows a shorthand, as in `[\w-]`, is just a hyphen.
        const rangeable = member.kind === "literal" || member.kind === "escapedLiteral";

        if (rangeable && at(cursor) === "-" && at(cursor, 1) !== "]" && at(cursor, 1) !== "") {
            cursor.index += 1;
            const upper = parseClassMember(cursor);

            children.push(
                node("classRange", member.start, cursor.index, { children: [member, upper] }),
            );
            continue;
        }

        children.push(member);
    }

    const closed = at(cursor) === "]";

    if (closed) {
        cursor.index += 1;
    }

    return node("characterClass", start, cursor.index, {
        negated,
        children,
        openLength: negated ? 2 : 1,
        closeLength: closed ? 1 : 0,
    });
}

/* ------------------------------------------------------------------ groups --- */

type GroupOpening = {
    readonly kind: RegexNodeKind;
    readonly openLength: number;
    readonly negated?: boolean;
    readonly groupName?: string;
    readonly detail?: string;
    /** Set when the construct has no sub-pattern, e.g. `(?#…)` and `(?R)`. */
    readonly opaque?: boolean;
};

/** Reads the `(`-introduced header. Positioned just after `(` on entry. */
function readGroupOpening(cursor: Cursor): GroupOpening {
    if (at(cursor) !== "?") {
        cursor.groupCount += 1;

        return { kind: "captureGroup", openLength: 1 };
    }

    const second = at(cursor, 1);

    if (second === ":") {
        return { kind: "nonCapturingGroup", openLength: 3 };
    }

    if (second === "=" || second === "!") {
        return { kind: "lookahead", openLength: 3, negated: second === "!" };
    }

    if (second === ">") {
        return { kind: "atomicGroup", openLength: 3 };
    }

    if (second === "#") {
        return { kind: "comment", openLength: 3, opaque: true };
    }

    if (second === "<" && (at(cursor, 2) === "=" || at(cursor, 2) === "!")) {
        return { kind: "lookbehind", openLength: 4, negated: at(cursor, 2) === "!" };
    }

    // `(?<name>` and PCRE's `(?P<name>` spell the same thing.
    const namedOffset = second === "<" ? 1 : second === "P" && at(cursor, 2) === "<" ? 2 : 0;

    if (namedOffset > 0) {
        const close = cursor.pattern.indexOf(">", cursor.index + namedOffset);

        if (close !== -1) {
            cursor.groupCount += 1;

            return {
                kind: "namedGroup",
                openLength: close - cursor.index + 2,
                groupName: cursor.pattern.slice(cursor.index + namedOffset + 1, close),
            };
        }
    }

    // `(?R)` and `(?1)` — PCRE recursion, which has no ECMAScript equivalent.
    if (second === "R" || (second >= "0" && second <= "9")) {
        return { kind: "recursion", openLength: 2, opaque: true };
    }

    const modifiers = INLINE_MODIFIERS.exec(cursor.pattern.slice(cursor.index));

    if (modifiers !== null) {
        return {
            kind: "modifierGroup",
            openLength: modifiers[0].length,
            detail: modifiers[1],
            // `(?i)` switches a flag on for the rest of the pattern and closes
            // immediately; `(?i:…)` wraps a sub-pattern.
            opaque: cursor.pattern[cursor.index + modifiers[0].length - 1] === ")",
        };
    }

    return { kind: "unknown", openLength: 2 };
}

function parseGroup(cursor: Cursor): RegexNode {
    const start = cursor.index;
    cursor.index += 1;

    const opening = readGroupOpening(cursor);
    // `openLength` counts the `(` the cursor has already passed.
    cursor.index += opening.openLength - 1;

    const capturing = opening.kind === "captureGroup" || opening.kind === "namedGroup";
    const groupIndex = capturing ? cursor.groupCount : undefined;

    if (capturing) {
        cursor.groups.push({ index: cursor.groupCount, name: opening.groupName ?? null });
    }

    // `(?#…)` and `(?R)` carry no sub-pattern; everything up to `)` is opaque.
    if (opening.opaque === true) {
        const close = cursor.pattern.indexOf(")", cursor.index);
        cursor.index = close === -1 ? cursor.pattern.length : close + 1;

        return node(opening.kind, start, cursor.index, {
            detail: opening.detail,
            openLength: opening.openLength,
            closeLength: close === -1 ? 0 : 1,
        });
    }

    const body = parseAlternation(cursor, true);
    const closed = at(cursor) === ")";

    if (closed) {
        cursor.index += 1;
    }

    return node(opening.kind, start, cursor.index, {
        children: [body],
        negated: opening.negated,
        detail: opening.detail,
        groupIndex,
        groupName: opening.groupName,
        openLength: opening.openLength,
        closeLength: closed ? 1 : 0,
    });
}

/* ------------------------------------------------------------------- atoms --- */

function parseAtom(cursor: Cursor, insideGroup: boolean): RegexNode | null {
    const character = at(cursor);

    if (character === "" || character === "|") {
        return null;
    }

    if (character === ")") {
        if (insideGroup) {
            return null;
        }

        // A `)` with no group to close. The engine rejects it; recording it as
        // an unknown atom keeps the span covered and the parser moving.
        const stray = cursor.index;
        cursor.index += 1;

        return node("unknown", stray, cursor.index);
    }

    if (cursor.extended) {
        if (/\s/.test(character)) {
            const start = cursor.index;

            while (/\s/.test(at(cursor))) {
                cursor.index += 1;
            }

            return node("ignorableWhitespace", start, cursor.index);
        }

        if (character === "#") {
            const start = cursor.index;
            const lineEnd = cursor.pattern.indexOf("\n", cursor.index);
            cursor.index = lineEnd === -1 ? cursor.pattern.length : lineEnd;

            return node("comment", start, cursor.index);
        }
    }

    if (character === "(") {
        return parseGroup(cursor);
    }

    if (character === "[") {
        return parseCharacterClass(cursor);
    }

    if (character === "\\") {
        return parseEscape(cursor, false);
    }

    const start = cursor.index;

    if (character === ".") {
        cursor.index += 1;

        return node("dot", start, cursor.index);
    }

    if (character === "^") {
        cursor.index += 1;

        return node("anchorStart", start, cursor.index);
    }

    if (character === "$") {
        cursor.index += 1;

        return node("anchorEnd", start, cursor.index);
    }

    // A quantifier with nothing in front of it.
    if (character === "*" || character === "+" || character === "?") {
        cursor.index += 1;

        return node("unknown", start, cursor.index);
    }

    // An astral character is two code units; consuming one would leave the
    // other half as its own bogus literal.
    const codePoint = cursor.pattern.codePointAt(cursor.index);
    cursor.index += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;

    return node("literal", start, cursor.index, {
        value: cursor.pattern.slice(start, cursor.index),
    });
}

/* --------------------------------------------------------------- sequences --- */

/**
 * Runs of plain characters read as one line in the explanation — `abc` is
 * "matches the characters abc literally", not three separate entries. Only
 * unquantified literals merge: the `c` in `abc+` belongs to its quantifier.
 */
function mergeLiterals(children: readonly RegexNode[]): RegexNode[] {
    const merged: RegexNode[] = [];
    let run: RegexNode[] = [];

    function flush() {
        if (run.length === 0) {
            return;
        }

        merged.push(
            run.length === 1
                ? run[0]
                : node("literal", run[0].start, run[run.length - 1].end, {
                      value: run.map((item) => item.value ?? "").join(""),
                  }),
        );
        run = [];
    }

    for (const child of children) {
        if (child.kind === "literal" && child.quantifier === undefined) {
            run.push(child);
            continue;
        }

        flush();
        merged.push(child);
    }

    flush();

    return merged;
}

function parseSequence(cursor: Cursor, insideGroup: boolean): RegexNode {
    const start = cursor.index;
    const children: RegexNode[] = [];

    while (!done(cursor)) {
        const atom = parseAtom(cursor, insideGroup);

        if (atom === null) {
            break;
        }

        const quantifier = parseQuantifier(cursor);

        children.push(quantifier === undefined ? atom : { ...atom, quantifier });
    }

    return node("sequence", start, cursor.index, { children: mergeLiterals(children) });
}

function parseAlternation(cursor: Cursor, insideGroup: boolean): RegexNode {
    const start = cursor.index;
    const branches: RegexNode[] = [parseSequence(cursor, insideGroup)];

    while (at(cursor) === "|") {
        cursor.index += 1;
        branches.push(parseSequence(cursor, insideGroup));
    }

    if (branches.length === 1) {
        return branches[0];
    }

    return node("alternation", start, cursor.index, { children: branches });
}

/* ------------------------------------------------------------------ public --- */

export function parsePattern(pattern: string, options: ParseOptions = {}): ParsedPattern {
    const cursor: Cursor = {
        pattern,
        extended: options.extended ?? false,
        index: 0,
        groupCount: 0,
        groups: [],
    };

    return { root: parseAlternation(cursor, false), groups: cursor.groups };
}

/** Depth-first walk, parents before children. */
export function walkNodes(root: RegexNode, visit: (node: RegexNode) => void): void {
    visit(root);

    for (const child of root.children ?? []) {
        walkNodes(child, visit);
    }
}
