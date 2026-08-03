import type { ShellDialect } from "../types";

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

export type TokenizeResult =
    | { readonly ok: true; readonly tokens: readonly string[] }
    | { readonly ok: false; readonly reason: "unbalanced_quote" };

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

/* ---------------------------------------------------------------- posix --- */

const ANSI_C_SIMPLE: Record<string, string> = {
    a: "",
    b: "\b",
    e: "",
    E: "",
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

function tokenizePosix(input: string): TokenizeResult {
    const tokens: string[] = [];
    let current = "";
    let started = false;
    let index = 0;

    const push = () => {
        if (started) {
            tokens.push(current);
            current = "";
            started = false;
        }
    };

    while (index < input.length) {
        const char = input[index];

        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            push();
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
                current += escaped;
                started = true;
                index += 2;
                continue;
            }

            current += "\\";
            started = true;
            index += 1;
            continue;
        }

        if (char === "$" && input[index + 1] === "'") {
            const read = readAnsiCQuoted(input, index + 2);

            if (!read) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            current += read.value;
            started = true;
            index = read.next;
            continue;
        }

        if (char === "'") {
            const end = input.indexOf("'", index + 1);

            if (end === -1) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            current += input.slice(index + 1, end);
            started = true;
            index = end + 1;
            continue;
        }

        if (char === '"') {
            let scan = index + 1;
            let closed = false;

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
                        current += escaped;
                        scan += 2;
                        continue;
                    }

                    current += "\\";
                    scan += 1;
                    continue;
                }

                current += inner;
                scan += 1;
            }

            if (!closed) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            started = true;
            index = scan;
            continue;
        }

        current += char;
        started = true;
        index += 1;
    }

    push();

    return { ok: true, tokens };
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
function splitWindowsCommandLine(input: string): TokenizeResult {
    const tokens: string[] = [];
    let current = "";
    let started = false;
    let quoted = false;
    let index = 0;

    const push = () => {
        if (started) {
            tokens.push(current);
            current = "";
            started = false;
        }
    };

    while (index < input.length) {
        const char = input[index];

        if (char === "\\") {
            let slashes = 0;

            while (input[index] === "\\") {
                slashes += 1;
                index += 1;
            }

            if (input[index] === '"') {
                current += "\\".repeat(Math.floor(slashes / 2));

                if (slashes % 2 === 1) {
                    current += '"';
                    index += 1;
                } else {
                    quoted = !quoted;
                    index += 1;
                }

                started = true;
                continue;
            }

            current += "\\".repeat(slashes);
            started = true;
            continue;
        }

        if (char === '"') {
            // `""` inside a quoted run is how a literal quote is written when
            // no backslash is available.
            if (quoted && input[index + 1] === '"') {
                current += '"';
                started = true;
                index += 2;
                continue;
            }

            quoted = !quoted;
            started = true;
            index += 1;
            continue;
        }

        if (!quoted && (char === " " || char === "\t" || char === "\n" || char === "\r")) {
            push();
            index += 1;
            continue;
        }

        current += char;
        started = true;
        index += 1;
    }

    if (quoted) {
        return { ok: false, reason: "unbalanced_quote" };
    }

    push();

    return { ok: true, tokens };
}

/* ----------------------------------------------------------- powershell --- */

const POWERSHELL_ESCAPES: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    a: "",
    b: "\b",
    f: "\f",
    v: "\v",
    "0": "\0",
    "`": "`",
    '"': '"',
    $: "$",
    "'": "'",
};

function tokenizePowerShell(input: string): TokenizeResult {
    const tokens: string[] = [];
    let current = "";
    let started = false;
    let index = 0;

    const push = () => {
        if (started) {
            tokens.push(current);
            current = "";
            started = false;
        }
    };

    while (index < input.length) {
        const char = input[index];

        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            push();
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
                current += POWERSHELL_ESCAPES[escaped] ?? escaped;
                started = true;
                index += 2;
                continue;
            }

            index += 1;
            continue;
        }

        if (char === "'") {
            let scan = index + 1;
            let closed = false;

            while (scan < input.length) {
                if (input[scan] === "'") {
                    // A doubled quote is the only escape a literal string has.
                    if (input[scan + 1] === "'") {
                        current += "'";
                        scan += 2;
                        continue;
                    }

                    closed = true;
                    scan += 1;
                    break;
                }

                current += input[scan];
                scan += 1;
            }

            if (!closed) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            started = true;
            index = scan;
            continue;
        }

        if (char === '"') {
            let scan = index + 1;
            let closed = false;

            while (scan < input.length) {
                const inner = input[scan];

                if (inner === '"') {
                    if (input[scan + 1] === '"') {
                        current += '"';
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
                        current += POWERSHELL_ESCAPES[escaped] ?? escaped;
                        scan += 2;
                        continue;
                    }

                    scan += 1;
                    continue;
                }

                // PowerShell has no backslash escape; curl.exe never sees one
                // it did not receive verbatim.
                current += inner;
                scan += 1;
            }

            if (!closed) {
                return { ok: false, reason: "unbalanced_quote" };
            }

            started = true;
            index = scan;
            continue;
        }

        current += char;
        started = true;
        index += 1;
    }

    push();

    return { ok: true, tokens };
}

/* --------------------------------------------------------------- public --- */

export function tokenize(input: string, dialect: ShellDialect): TokenizeResult {
    if (dialect === "cmd") {
        return splitWindowsCommandLine(uncaret(input));
    }

    return dialect === "powershell" ? tokenizePowerShell(input) : tokenizePosix(input);
}
