/**
 * Splitting a pasted command into arguments is the whole ball game, and there
 * is no single answer: Chrome, Firefox and Safari all offer "Copy as cURL" in
 * bash, cmd and PowerShell, and the three escape nothing alike. A `"` inside a
 * JSON body arrives as `\"` from bash, `\^"` from cmd, and `` `" `` from
 * PowerShell — read with the wrong set of rules, each becomes a different
 * string, and the tool would confidently convert a request nobody made.
 *
 * So the dialect is detected first and the rules are picked from it, rather
 * than one forgiving pass trying to satisfy all three at once.
 */

/**
 * How a shell command is quoted. Also what a pasted command is detected as —
 * Chrome, Firefox and Safari all offer "Copy as cURL" in each of these three,
 * and they escape nothing alike.
 */
export const SHELL_DIALECTS = ["posix", "cmd", "powershell"] as const;

export type ShellDialect = (typeof SHELL_DIALECTS)[number];

type TokenizeFailure = { readonly ok: false; readonly reason: "unbalanced_quote" };

export type TokenizeResult =
    { readonly ok: true; readonly tokens: readonly string[] } | TokenizeFailure;

/**
 * One run of a word that was quoted one way. `expandable` is true where a POSIX
 * shell would still expand `$` and backticks — unquoted or double-quoted text.
 * `'$HOME'` and `"$HOME"` are the same characters and opposite meanings, and a
 * converter writing for something that interpolates has to know which it got.
 *
 * Only the POSIX reader sets it: cmd never expands `$`, and PowerShell's
 * `$env:NAME` is not a syntax anything downstream shares.
 */
export type ShellSegment = { readonly text: string; readonly expandable: boolean };

export type ShellWord = readonly ShellSegment[];

/** Commands split where the shell splits them: at an unquoted line break. */
export type TokenizeCommandsResult =
    { readonly ok: true; readonly commands: readonly (readonly ShellWord[])[] } | TokenizeFailure;

/** A leading shell prompt, copied along with the command more often than not. */
const PROMPT_PATTERN = /^[ \t]*(?:\$|>|#|PS [^>\n]*>)[ \t]+/;

export function stripPrompt(input: string): string {
    return input
        .split("\n")
        .map((line) => line.replace(PROMPT_PATTERN, ""))
        .join("\n");
}

/**
 * PowerShell is recognised first because it is the only dialect that renames
 * the command: `curl` there is an alias for `Invoke-WebRequest`, so anything
 * generated for it says `curl.exe`.
 */
export function detectShellDialect(input: string): ShellDialect {
    if (/\bcurl\.exe\b/.test(input) || /`[ \t]*\r?\n/.test(input)) {
        return "powershell";
    }

    if (/\^[ \t]*\r?\n/.test(input) || input.includes('^"')) {
        return "cmd";
    }

    return "posix";
}

export function wordText(word: ShellWord): string {
    return word.map((segment) => segment.text).join("");
}

/**
 * Collects segments into words and words into commands. A word is started by
 * anything that belongs to it — `''` is an argument, an empty one — and ended
 * by unquoted whitespace.
 */
class WordSink {
    private readonly commands: ShellWord[][] = [[]];
    private segments: ShellSegment[] = [];
    private text = "";
    private expandable = false;
    private started = false;

    append(text: string, expandable: boolean): void {
        this.started = true;

        if (text.length === 0) {
            return;
        }

        if (this.text.length > 0 && expandable !== this.expandable) {
            this.segments.push({ text: this.text, expandable: this.expandable });
            this.text = "";
        }

        this.text += text;
        this.expandable = expandable;
    }

    endWord(): void {
        if (!this.started) {
            return;
        }

        if (this.text.length > 0) {
            this.segments.push({ text: this.text, expandable: this.expandable });
        }

        this.commands[this.commands.length - 1].push(this.segments);
        this.segments = [];
        this.text = "";
        this.started = false;
    }

    endCommand(): void {
        this.endWord();

        if (this.commands[this.commands.length - 1].length > 0) {
            this.commands.push([]);
        }
    }

    drain(): TokenizeCommandsResult {
        this.endWord();

        return { ok: true, commands: this.commands.filter((command) => command.length > 0) };
    }
}

/* ---------------------------------------------------------------- posix --- */

const ANSI_C_SIMPLE: Record<string, string> = {
    a: "",
    b: "\b",
    e: "",
    E: "",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\",
    "'": "'",
    '"': '"',
    "?": "?",
};

/**
 * `$'…'` — ANSI-C quoting. Chrome reaches for it the moment a header or body
 * holds a newline or a non-ASCII byte, so a tool that cannot read it cannot
 * read a large share of what people paste.
 */
function readAnsiCQuoted(input: string, start: number): { value: string; next: number } | null {
    let out = "";
    let index = start;

    while (index < input.length) {
        const char = input[index];

        if (char === "'") {
            return { value: out, next: index + 1 };
        }

        if (char !== "\\") {
            out += char;
            index += 1;
            continue;
        }

        const escape = input[index + 1];

        if (escape === undefined) {
            out += "\\";
            index += 1;
            continue;
        }

        const simple = ANSI_C_SIMPLE[escape];

        if (simple !== undefined) {
            out += simple;
            index += 2;
            continue;
        }

        if (escape === "x") {
            const hex = /^[\da-f]{1,2}/i.exec(input.slice(index + 2));

            if (hex) {
                out += String.fromCharCode(Number.parseInt(hex[0], 16));
                index += 2 + hex[0].length;
                continue;
            }
        }

        if (escape === "u" || escape === "U") {
            const width = escape === "u" ? 4 : 8;
            const hex = new RegExp(`^[\\da-f]{1,${width}}`, "i").exec(input.slice(index + 2));

            if (hex) {
                out += String.fromCodePoint(Number.parseInt(hex[0], 16));
                index += 2 + hex[0].length;
                continue;
            }
        }

        const octal = /^[0-7]{1,3}/.exec(input.slice(index + 1));

        if (octal) {
            out += String.fromCharCode(Number.parseInt(octal[0], 8));
            index += 1 + octal[0].length;
            continue;
        }

        out += escape;
        index += 2;
    }

    return null;
}

function tokenizePosix(input: string): TokenizeCommandsResult {
    const sink = new WordSink();
    let index = 0;

    while (index < input.length) {
        const char = input[index];

        if (char === "\n") {
            sink.endCommand();
            index += 1;
            continue;
        }

        if (char === " " || char === "\t" || char === "\r") {
            sink.endWord();
            index += 1;
            continue;
        }

        if (char === "\\") {
            const escaped = input[index + 1];

            // A backslash before a newline is the line continuation, and both
            // characters simply leave.
            if (escaped === "\n") {
                index += 2;
                continue;
            }

            if (escaped === "\r" && input[index + 2] === "\n") {
                index += 3;
                continue;
            }

            if (escaped !== undefined) {
                sink.append(escaped, false);
                index += 2;
                continue;
            }

            sink.append("\\", false);
            index += 1;
            continue;
        }

        if (char === "$" && input[index + 1] === "'") {
            const read = readAnsiCQuoted(input, index + 2);

            if (!read) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            sink.append(read.value, false);
            index = read.next;
            continue;
        }

        if (char === "'") {
            const end = input.indexOf("'", index + 1);

            if (end === -1) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            sink.append(input.slice(index + 1, end), false);
            index = end + 1;
            continue;
        }

        if (char === '"') {
            let scan = index + 1;
            let closed = false;

            // `""` is an argument even though nothing is appended to it.
            sink.append("", true);

            while (scan < input.length) {
                const inner = input[scan];

                if (inner === '"') {
                    closed = true;
                    scan += 1;
                    break;
                }

                if (inner === "\\") {
                    const escaped = input[scan + 1];

                    // Inside double quotes bash only honours five escapes; a
                    // `\d` in a regex payload has to survive as two characters.
                    if (escaped === "\n") {
                        scan += 2;
                        continue;
                    }

                    if (escaped === '"' || escaped === "\\" || escaped === "$" || escaped === "`") {
                        sink.append(escaped, false);
                        scan += 2;
                        continue;
                    }

                    sink.append("\\", true);
                    scan += 1;
                    continue;
                }

                sink.append(inner, true);
                scan += 1;
            }

            if (!closed) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            index = scan;
            continue;
        }

        sink.append(char, true);
        index += 1;
    }

    return sink.drain();
}

/* ------------------------------------------------------------------ cmd --- */

/**
 * cmd is two layers, and conflating them is what makes hand-rolled readers get
 * `^"` wrong. The shell resolves `^` first and hands a plain command line to
 * the program; the program's own C runtime then splits that line on the MSVC
 * rules. So this runs the same two passes in the same order.
 */
function uncaret(input: string): string {
    let out = "";
    let index = 0;

    while (index < input.length) {
        if (input[index] !== "^") {
            out += input[index];
            index += 1;
            continue;
        }

        const escaped = input[index + 1];

        if (escaped === undefined) {
            index += 1;
            continue;
        }

        if (escaped === "\n") {
            index += 2;
            continue;
        }

        if (escaped === "\r" && input[index + 2] === "\n") {
            index += 3;
            continue;
        }

        out += escaped;
        index += 2;
    }

    return out;
}

/** MSVC `argv` rules: backslashes only matter in front of a quote. */
function splitWindowsCommandLine(input: string): TokenizeCommandsResult {
    const sink = new WordSink();
    let quoted = false;
    let index = 0;

    while (index < input.length) {
        const char = input[index];

        if (char === "\\") {
            let slashes = 0;

            while (input[index] === "\\") {
                slashes += 1;
                index += 1;
            }

            if (input[index] === '"') {
                sink.append("\\".repeat(Math.floor(slashes / 2)), false);

                if (slashes % 2 === 1) {
                    sink.append('"', false);
                } else {
                    quoted = !quoted;
                }

                index += 1;
                continue;
            }

            sink.append("\\".repeat(slashes), false);
            continue;
        }

        if (char === '"') {
            // `""` inside a quoted run is how a literal quote is written when
            // no backslash is available.
            if (quoted && input[index + 1] === '"') {
                sink.append('"', false);
                index += 2;
                continue;
            }

            quoted = !quoted;
            sink.append("", false);
            index += 1;
            continue;
        }

        if (!quoted && char === "\n") {
            sink.endCommand();
            index += 1;
            continue;
        }

        if (!quoted && (char === " " || char === "\t" || char === "\r")) {
            sink.endWord();
            index += 1;
            continue;
        }

        sink.append(char, false);
        index += 1;
    }

    if (quoted) {
        return { ok: false, reason: "unbalanced_quote" };
    }

    return sink.drain();
}

/* ----------------------------------------------------------- powershell --- */

const POWERSHELL_ESCAPES: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    a: "",
    b: "\b",
    f: "\f",
    v: "\v",
    "0": "\0",
    "`": "`",
    '"': '"',
    $: "$",
    "'": "'",
};

function tokenizePowerShell(input: string): TokenizeCommandsResult {
    const sink = new WordSink();
    let index = 0;

    while (index < input.length) {
        const char = input[index];

        if (char === "\n") {
            sink.endCommand();
            index += 1;
            continue;
        }

        if (char === " " || char === "\t" || char === "\r") {
            sink.endWord();
            index += 1;
            continue;
        }

        if (char === "`") {
            const escaped = input[index + 1];

            if (escaped === "\n") {
                index += 2;
                continue;
            }

            if (escaped === "\r" && input[index + 2] === "\n") {
                index += 3;
                continue;
            }

            if (escaped !== undefined) {
                sink.append(POWERSHELL_ESCAPES[escaped] ?? escaped, false);
                index += 2;
                continue;
            }

            index += 1;
            continue;
        }

        if (char === "'") {
            let scan = index + 1;
            let closed = false;

            sink.append("", false);

            while (scan < input.length) {
                if (input[scan] === "'") {
                    // A doubled quote is the only escape a literal string has.
                    if (input[scan + 1] === "'") {
                        sink.append("'", false);
                        scan += 2;
                        continue;
                    }

                    closed = true;
                    scan += 1;
                    break;
                }

                sink.append(input[scan], false);
                scan += 1;
            }

            if (!closed) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            index = scan;
            continue;
        }

        if (char === '"') {
            let scan = index + 1;
            let closed = false;

            sink.append("", false);

            while (scan < input.length) {
                const inner = input[scan];

                if (inner === '"') {
                    if (input[scan + 1] === '"') {
                        sink.append('"', false);
                        scan += 2;
                        continue;
                    }

                    closed = true;
                    scan += 1;
                    break;
                }

                if (inner === "`") {
                    const escaped = input[scan + 1];

                    if (escaped === "\n") {
                        scan += 2;
                        continue;
                    }

                    if (escaped !== undefined) {
                        sink.append(POWERSHELL_ESCAPES[escaped] ?? escaped, false);
                        scan += 2;
                        continue;
                    }

                    scan += 1;
                    continue;
                }

                // PowerShell has no backslash escape; curl.exe never sees one
                // it did not receive verbatim.
                sink.append(inner, false);
                scan += 1;
            }

            if (!closed) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            index = scan;
            continue;
        }

        sink.append(char, false);
        index += 1;
    }

    return sink.drain();
}

/* --------------------------------------------------------------- public --- */

/** Every command in the input, each as words that remember how they were quoted. */
export function tokenizeCommands(input: string, dialect: ShellDialect): TokenizeCommandsResult {
    if (dialect === "cmd") {
        return splitWindowsCommandLine(uncaret(input));
    }

    return dialect === "powershell" ? tokenizePowerShell(input) : tokenizePosix(input);
}

/** The arguments as plain strings, with line breaks read as spaces. */
export function tokenize(input: string, dialect: ShellDialect): TokenizeResult {
    const read = tokenizeCommands(input, dialect);

    if (!read.ok) {
        return read;
    }

    return { ok: true, tokens: read.commands.flat().map(wordText) };
}
