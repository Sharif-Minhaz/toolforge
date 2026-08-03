/**
 * A reader for the slice of JavaScript that `fetch` snippets are written in:
 * string, number and boolean literals, object and array literals, `new X(…)`,
 * and calls such as `JSON.stringify(…)` or `AbortSignal.timeout(…)`.
 *
 * It is deliberately not a JavaScript parser, and it never pretends to be one.
 * Anything it does not recognise comes back as `raw` — the source text,
 * untouched — so an unusual snippet degrades to "this expression was left as
 * written" instead of taking the whole conversion down. A real parser is a
 * dependency, a bundle, and a far larger surface, for the sake of expressions
 * almost nobody writes inside a `fetch` init object.
 */

export type JsEntry = {
    readonly key: string;
    readonly value: JsValue;
};

export type JsValue =
    | { readonly kind: "string"; readonly value: string }
    | { readonly kind: "number"; readonly value: number }
    | { readonly kind: "boolean"; readonly value: boolean }
    | { readonly kind: "null" }
    | { readonly kind: "undefined" }
    | { readonly kind: "array"; readonly items: readonly JsValue[] }
    | { readonly kind: "object"; readonly entries: readonly JsEntry[] }
    | {
          readonly kind: "call";
          /** Dotted path as written — `JSON.stringify`, `Headers`, `URL`. */
          readonly callee: string;
          readonly args: readonly JsValue[];
          readonly isNew: boolean;
      }
    | { readonly kind: "identifier"; readonly name: string }
    | { readonly kind: "raw"; readonly text: string };

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;

const DECLARATION_KEYWORDS = new Set(["const", "let", "var"]);

const STRING_ESCAPES: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    b: "\b",
    f: "\f",
    v: "\v",
    "0": "\0",
    "\\": "\\",
    "'": "'",
    '"': '"',
    "`": "`",
    "\n": "",
};

/** Where an expression ends, for the fallback path. */
const TERMINATORS = new Set([",", "}", "]", ")", ";"]);

export class JsReader {
    private index = 0;

    constructor(private readonly source: string) {}

    get position(): number {
        return this.index;
    }

    set position(value: number) {
        this.index = value;
    }

    get done(): boolean {
        return this.index >= this.source.length;
    }

    peek(): string | undefined {
        return this.source[this.index];
    }

    advance(): void {
        this.index += 1;
    }

    /** Whitespace and both comment forms — all that may sit between tokens. */
    skipTrivia(): void {
        for (;;) {
            const char = this.source[this.index];

            if (char === " " || char === "\t" || char === "\n" || char === "\r") {
                this.index += 1;
                continue;
            }

            if (char === "/" && this.source[this.index + 1] === "/") {
                const end = this.source.indexOf("\n", this.index);

                this.index = end === -1 ? this.source.length : end + 1;
                continue;
            }

            if (char === "/" && this.source[this.index + 1] === "*") {
                const end = this.source.indexOf("*/", this.index + 2);

                this.index = end === -1 ? this.source.length : end + 2;
                continue;
            }

            return;
        }
    }

    /**
     * The same, minus newlines. Used right after an expression, because these
     * snippets are often written without semicolons: a line break there ends
     * the statement, and skipping it would run two of them together.
     */
    private skipInlineTrivia(): void {
        for (;;) {
            const char = this.source[this.index];

            if (char === " " || char === "\t") {
                this.index += 1;
                continue;
            }

            if (char === "/" && this.source[this.index + 1] === "*") {
                const end = this.source.indexOf("*/", this.index + 2);

                if (end === -1 || this.source.slice(this.index, end).includes("\n")) {
                    return;
                }

                this.index = end + 2;
                continue;
            }

            return;
        }
    }

    /**
     * Whether the expression just read is finished. A line break counts, since
     * these snippets are often written without semicolons, and so does the
     * start of a comment — everything after `//` belongs to the reader, not to
     * the expression.
     */
    private atEndOfExpression(): boolean {
        const char = this.source[this.index];

        if (char === undefined || char === "\n" || char === "\r" || TERMINATORS.has(char)) {
            return true;
        }

        return (
            char === "/" &&
            (this.source[this.index + 1] === "/" || this.source[this.index + 1] === "*")
        );
    }

    readIdentifierPath(): string | null {
        this.skipTrivia();

        const start = this.index;

        if (!IDENTIFIER_START.test(this.source[this.index] ?? "")) {
            return null;
        }

        while (this.index < this.source.length) {
            const char = this.source[this.index];

            if (IDENTIFIER_PART.test(char)) {
                this.index += 1;
                continue;
            }

            if (char === "." && IDENTIFIER_START.test(this.source[this.index + 1] ?? "")) {
                this.index += 1;
                continue;
            }

            break;
        }

        return this.source.slice(start, this.index);
    }

    /**
     * A quoted string. Returns null for a template holding `${…}`, whose value
     * is not knowable from the text — the caller keeps it as `raw`.
     */
    readString(): string | null {
        this.skipTrivia();

        const quote = this.source[this.index];

        if (quote !== "'" && quote !== '"' && quote !== "`") {
            return null;
        }

        let out = "";
        let scan = this.index + 1;

        while (scan < this.source.length) {
            const char = this.source[scan];

            if (char === quote) {
                this.index = scan + 1;

                return out;
            }

            if (quote === "`" && char === "$" && this.source[scan + 1] === "{") {
                return null;
            }

            if (char === "\\") {
                const escaped = this.source[scan + 1];

                if (escaped === undefined) {
                    return null;
                }

                if (escaped === "x" || escaped === "u") {
                    const rest = this.source.slice(scan + 2);
                    const pattern =
                        escaped === "x"
                            ? /^[\da-f]{2}/i
                            : rest.startsWith("{")
                              ? /^\{[\da-f]{1,6}\}/i
                              : /^[\da-f]{4}/i;
                    const match = pattern.exec(rest);

                    if (match) {
                        const digits = match[0].replace(/[{}]/g, "");

                        out += String.fromCodePoint(Number.parseInt(digits, 16));
                        scan += 2 + match[0].length;
                        continue;
                    }
                }

                out += STRING_ESCAPES[escaped] ?? escaped;
                scan += 2;
                continue;
            }

            out += char;
            scan += 1;
        }

        return null;
    }

    /** Walks past a string literal without decoding it. */
    skipString(): void {
        const quote = this.source[this.index];

        this.index += 1;

        while (this.index < this.source.length) {
            const char = this.source[this.index];

            if (char === "\\") {
                this.index += 2;
                continue;
            }

            if (char === quote) {
                this.index += 1;

                return;
            }

            this.index += 1;
        }
    }

    /** The next expression as source text, scanned with brackets balanced. */
    readRawSpan(): string {
        this.skipTrivia();

        const start = this.index;
        let depth = 0;

        while (this.index < this.source.length) {
            const char = this.source[this.index];

            if (char === "'" || char === '"' || char === "`") {
                this.skipString();
                continue;
            }

            if (char === "(" || char === "[" || char === "{") {
                depth += 1;
                this.index += 1;
                continue;
            }

            if (char === ")" || char === "]" || char === "}") {
                if (depth === 0) {
                    break;
                }

                depth -= 1;
                this.index += 1;
                continue;
            }

            if (depth === 0 && (TERMINATORS.has(char) || char === "\n")) {
                break;
            }

            this.index += 1;
        }

        return this.source.slice(start, this.index).trim();
    }

    /** Reads `( … )` from the opening parenthesis. */
    readArguments(): JsValue[] {
        const args: JsValue[] = [];

        if (this.source[this.index] !== "(") {
            return args;
        }

        this.index += 1;

        for (;;) {
            this.skipTrivia();

            if (this.done || this.source[this.index] === ")") {
                this.index += 1;
                break;
            }

            if (this.source[this.index] === ",") {
                this.index += 1;
                continue;
            }

            const before = this.index;

            args.push(this.readValue());

            // Nothing consumed means the reader is wedged on a character it
            // cannot classify; stepping over it is better than looping.
            if (this.index === before) {
                this.index += 1;
            }
        }

        return args;
    }

    private readArray(): JsValue {
        const items: JsValue[] = [];

        this.index += 1;

        for (;;) {
            this.skipTrivia();

            if (this.done || this.source[this.index] === "]") {
                this.index += 1;
                break;
            }

            if (this.source[this.index] === ",") {
                this.index += 1;
                continue;
            }

            const before = this.index;

            items.push(this.readValue());

            if (this.index === before) {
                this.index += 1;
            }
        }

        return { kind: "array", items };
    }

    private readObject(): JsValue {
        const entries: JsEntry[] = [];

        this.index += 1;

        for (;;) {
            this.skipTrivia();

            if (this.done || this.source[this.index] === "}") {
                this.index += 1;
                break;
            }

            if (this.source[this.index] === ",") {
                this.index += 1;
                continue;
            }

            // A spread carries no key, and its contents are unknowable here.
            if (this.source.startsWith("...", this.index)) {
                this.index += 3;
                entries.push({ key: "", value: { kind: "raw", text: this.readRawSpan() } });
                continue;
            }

            const before = this.index;
            const quoted = this.readString();
            const key = quoted ?? this.readIdentifierPath() ?? this.readRawSpan();

            this.skipTrivia();

            if (this.source[this.index] === ":") {
                this.index += 1;
                entries.push({ key, value: this.readValue() });
            } else {
                // Shorthand — `{ headers }` — names an identifier as both.
                entries.push({ key, value: { kind: "identifier", name: key } });
            }

            if (this.index === before) {
                this.index += 1;
            }
        }

        return { kind: "object", entries };
    }

    readValue(): JsValue {
        this.skipTrivia();

        const start = this.index;
        const value = this.readValueAtom();

        this.skipInlineTrivia();

        // The atom is the whole expression only when what follows closes it.
        // An operator, a member access or a ternary means this reader is out of
        // its depth, and the source text is the honest answer.
        if (this.atEndOfExpression()) {
            return value;
        }

        const next = this.source[this.index];

        if (next === "+" && value.kind === "string") {
            const folded = this.foldStringConcatenation(value.value);

            if (folded !== null) {
                return { kind: "string", value: folded };
            }
        }

        this.index = start;

        return { kind: "raw", text: this.readRawSpan() };
    }

    /** `"https://x" + "/path"` is common enough to be worth resolving. */
    private foldStringConcatenation(first: string): string | null {
        const restore = this.index;
        let out = first;

        for (;;) {
            this.skipTrivia();

            if (this.source[this.index] !== "+") {
                break;
            }

            this.index += 1;

            const next = this.readString();

            if (next === null) {
                this.index = restore;

                return null;
            }

            out += next;
        }

        this.skipInlineTrivia();

        if (!this.atEndOfExpression()) {
            this.index = restore;

            return null;
        }

        return out;
    }

    private readValueAtom(): JsValue {
        this.skipTrivia();

        const char = this.source[this.index];

        if (char === undefined) {
            return { kind: "raw", text: "" };
        }

        // `await` is not part of the value, and reading it as an identifier
        // would leave the call after it looking like a stray expression — which
        // is how `const response = await fetch(…)` came back as source text.
        if (
            this.source.startsWith("await", this.index) &&
            !IDENTIFIER_PART.test(this.source[this.index + 5] ?? "")
        ) {
            this.index += 5;

            return this.readValueAtom();
        }

        if (char === "'" || char === '"' || char === "`") {
            const start = this.index;
            const text = this.readString();

            if (text === null) {
                this.index = start;

                return { kind: "raw", text: this.readRawSpan() };
            }

            return { kind: "string", value: text };
        }

        if (char === "[") {
            return this.readArray();
        }

        if (char === "{") {
            return this.readObject();
        }

        if (/\d/.test(char) || (char === "-" && /\d/.test(this.source[this.index + 1] ?? ""))) {
            const match = /^-?\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(
                this.source.slice(this.index),
            );

            if (match) {
                this.index += match[0].length;

                return { kind: "number", value: Number(match[0].replaceAll("_", "")) };
            }
        }

        if (
            this.source.startsWith("new", this.index) &&
            !IDENTIFIER_PART.test(this.source[this.index + 3] ?? "")
        ) {
            this.index += 3;

            const callee = this.readIdentifierPath();

            this.skipTrivia();

            return {
                kind: "call",
                callee: callee ?? "",
                args: this.source[this.index] === "(" ? this.readArguments() : [],
                isNew: true,
            };
        }

        const path = this.readIdentifierPath();

        if (path === null) {
            return { kind: "raw", text: this.readRawSpan() };
        }

        if (path === "true" || path === "false") {
            return { kind: "boolean", value: path === "true" };
        }

        if (path === "null") {
            return { kind: "null" };
        }

        if (path === "undefined") {
            return { kind: "undefined" };
        }

        this.skipTrivia();

        if (this.source[this.index] === "(") {
            return { kind: "call", callee: path, args: this.readArguments(), isNew: false };
        }

        return { kind: "identifier", name: path };
    }
}

/* --------------------------------------------------------------- reading --- */

export function entryOf(value: JsValue | null, key: string): JsValue | null {
    if (value === null || value.kind !== "object") {
        return null;
    }

    const wanted = key.toLowerCase();

    return value.entries.find((entry) => entry.key.toLowerCase() === wanted)?.value ?? null;
}

export function asString(value: JsValue | null): string | null {
    if (value === null) {
        return null;
    }

    if (value.kind === "string") {
        return value.value;
    }

    return value.kind === "number" || value.kind === "boolean" ? String(value.value) : null;
}

export function asNumber(value: JsValue | null): number | null {
    if (value === null) {
        return null;
    }

    if (value.kind === "number") {
        return value.value;
    }

    if (value.kind === "string") {
        const parsed = Number(value.value);

        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

export function asBoolean(value: JsValue | null): boolean | null {
    return value !== null && value.kind === "boolean" ? value.value : null;
}

/* -------------------------------------------------------------- scanning --- */

export type SourceCall = {
    /** Dotted path as written, so `form.append` keeps its receiver. */
    readonly callee: string;
    readonly args: readonly JsValue[];
};

export type ScannedSource = {
    /** `const x = …` at any depth, so a snippet may build things before it
     *  calls `fetch`. Later declarations of one name win, as they would. */
    readonly declarations: ReadonlyMap<string, JsValue>;
    readonly calls: readonly SourceCall[];
};

/** Every call inside a value, in source order — `const r = await fetch(…)`
 *  holds its call as part of the declaration rather than as a statement. */
function collectCalls(value: JsValue, out: SourceCall[]): void {
    switch (value.kind) {
        case "call":
            out.push({ callee: value.callee, args: value.args });

            for (const argument of value.args) {
                collectCalls(argument, out);
            }

            return;
        case "array":
            for (const item of value.items) {
                collectCalls(item, out);
            }

            return;
        case "object":
            for (const entry of value.entries) {
                collectCalls(entry.value, out);
            }

            return;
        default:
            return;
    }
}

/**
 * One pass over the whole snippet, collecting what a `fetch` call needs from
 * around it: the `const form = new FormData()` above it, the `form.append(…)`
 * lines after that, and the call itself. Strings and comments are stepped over
 * rather than searched, so a URL containing the word `fetch` is not a call.
 */
export function scanSource(source: string, depth = 0): ScannedSource {
    const reader = new JsReader(source);
    const declarations = new Map<string, JsValue>();
    const calls: SourceCall[] = [];

    while (!reader.done) {
        reader.skipTrivia();

        if (reader.done) {
            break;
        }

        const char = reader.peek() ?? "";

        if (char === "'" || char === '"' || char === "`") {
            reader.skipString();
            continue;
        }

        if (!IDENTIFIER_START.test(char)) {
            reader.advance();
            continue;
        }

        const path = reader.readIdentifierPath();

        if (path === null) {
            reader.advance();
            continue;
        }

        if (DECLARATION_KEYWORDS.has(path)) {
            const name = reader.readIdentifierPath();

            reader.skipTrivia();

            if (name !== null && reader.peek() === "=") {
                reader.advance();

                const declared = reader.readValue();

                declarations.set(name, declared);
                collectCalls(declared, calls);

                // A value this reader could not classify may still hold the
                // call — `cond ? fetch(a) : fetch(b)` comes back as source
                // text, and the call inside it is what the tool is after.
                if (declared.kind === "raw" && depth < 2 && declared.text.length < source.length) {
                    calls.push(...scanSource(declared.text, depth + 1).calls);
                }
            }

            continue;
        }

        reader.skipTrivia();

        if (reader.peek() === "(") {
            calls.push({ callee: path, args: reader.readArguments() });
        }
    }

    return { declarations, calls };
}

/** Follows `{ headers }` back to whatever `headers` was declared as. */
export function resolve(
    value: JsValue | null,
    declarations: ReadonlyMap<string, JsValue>,
    depth = 0,
): JsValue | null {
    if (value === null || value.kind !== "identifier" || depth > 4) {
        return value;
    }

    const declared = declarations.get(value.name);

    return declared === undefined ? value : resolve(declared, declarations, depth + 1);
}
