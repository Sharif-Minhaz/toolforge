import type { ShellDialect } from "./shell-tokenize";

/**
 * Every character a dialect leaves alone. Anything outside it gets quoted,
 * which is cheap and never wrong; quoting too little is what produces a command
 * that runs and sends something else.
 */
const POSIX_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

function quotePosix(value: string): string {
    if (value.length > 0 && POSIX_SAFE.test(value)) {
        return value;
    }

    // A single-quoted string in sh has no escapes at all, so the only way to
    // include one is to close, escape it outside, and reopen.
    return `'${value.replaceAll("'", "'\\''")}'`;
}

/** PowerShell's literal string doubles the quote and honours nothing else. */
function quotePowerShell(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

/**
 * cmd is the awkward one: the quoting that matters is the C runtime's, not the
 * shell's, so backslashes only need doubling when they sit in front of a quote
 * — including the closing one this adds.
 */
function quoteCmd(value: string): string {
    const escaped = value
        .replace(/(\\*)"/g, (_match, slashes: string) => `${slashes}${slashes}\\"`)
        .replace(/(\\+)$/, (_match, slashes: string) => `${slashes}${slashes}`);

    return `"${escaped}"`;
}

/** One argument, quoted so the dialect hands it to the program unchanged. */
export function quoteArgument(value: string, dialect: ShellDialect): string {
    switch (dialect) {
        case "posix":
            return quotePosix(value);
        case "powershell":
            return quotePowerShell(value);
        case "cmd":
            return quoteCmd(value);
    }
}
