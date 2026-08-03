import { describe, expect, test } from "bun:test";

import { detectShellDialect, stripPrompt, tokenize } from "@/modules/curl/domain/tokenize";
import type { ShellDialect } from "@/modules/curl/types";

function tokensOf(input: string, dialect: ShellDialect): readonly string[] {
    const result = tokenize(input, dialect);

    if (!result.ok) {
        throw new Error(`expected ${dialect} to tokenize: ${input}`);
    }

    return result.tokens;
}

describe("detectShellDialect", () => {
    test("reads a plain command as POSIX", () => {
        expect(detectShellDialect("curl 'https://example.com' -H 'Accept: */*'")).toBe("posix");
    });

    test("recognises PowerShell by the executable it has to name", () => {
        expect(detectShellDialect('curl.exe "https://example.com"')).toBe("powershell");
    });

    test("recognises PowerShell by its continuation mark", () => {
        expect(detectShellDialect('curl "https://example.com" `\n  -H "Accept: */*"')).toBe(
            "powershell",
        );
    });

    test("recognises cmd by its continuation mark", () => {
        expect(detectShellDialect('curl "https://example.com" ^\n  -H "Accept: */*"')).toBe("cmd");
    });

    test("recognises cmd by a caret-escaped quote", () => {
        expect(detectShellDialect('curl "https://x" --data-raw ^"{}^"')).toBe("cmd");
    });
});

describe("stripPrompt", () => {
    test("removes a copied shell prompt from every line", () => {
        expect(stripPrompt("$ curl https://example.com\n> -H 'Accept: */*'")).toBe(
            "curl https://example.com\n-H 'Accept: */*'",
        );
    });

    test("leaves a line that merely starts with a word alone", () => {
        expect(stripPrompt("curl https://example.com")).toBe("curl https://example.com");
    });
});

describe("tokenize — POSIX", () => {
    test("splits on whitespace and keeps quoted runs whole", () => {
        expect(tokensOf("curl 'https://example.com' -H 'Accept: */*'", "posix")).toEqual([
            "curl",
            "https://example.com",
            "-H",
            "Accept: */*",
        ]);
    });

    test("follows a backslash line continuation", () => {
        expect(tokensOf("curl \\\n  -X POST \\\n  https://example.com", "posix")).toEqual([
            "curl",
            "-X",
            "POST",
            "https://example.com",
        ]);
    });

    test("reads the close-escape-reopen idiom for a single quote", () => {
        expect(tokensOf("curl -d 'it'\\''s here'", "posix")).toEqual(["curl", "-d", "it's here"]);
    });

    test("honours only the five escapes a double-quoted string has", () => {
        // `\d` is two characters inside double quotes — a regex payload depends
        // on it surviving, while `\"` and `\\` must collapse.
        expect(tokensOf('curl -d "a\\"b\\\\c\\d"', "posix")).toEqual(["curl", "-d", 'a"b\\c\\d']);
    });

    test("decodes ANSI-C quoting, which is how a newline is copied", () => {
        expect(tokensOf("curl -d $'line1\\nline2\\ttab'", "posix")).toEqual([
            "curl",
            "-d",
            "line1\nline2\ttab",
        ]);
    });

    test("decodes hex, unicode and octal escapes inside ANSI-C quoting", () => {
        expect(tokensOf("curl -d $'\\x41\\u00e9\\101'", "posix")).toEqual(["curl", "-d", "AéA"]);
    });

    test("joins adjacent quoted and bare runs into one argument", () => {
        expect(tokensOf("curl -H 'Accept: '\"application/json\"", "posix")).toEqual([
            "curl",
            "-H",
            "Accept: application/json",
        ]);
    });

    test("keeps an empty quoted argument", () => {
        expect(tokensOf("curl -d '' https://example.com", "posix")).toEqual([
            "curl",
            "-d",
            "",
            "https://example.com",
        ]);
    });

    test("reports an unbalanced quote rather than guessing where it closed", () => {
        expect(tokenize("curl 'https://example.com", "posix")).toEqual({
            ok: false,
            reason: "unbalanced_quote",
        });
    });
});

describe("tokenize — cmd", () => {
    test("follows a caret continuation", () => {
        expect(tokensOf('curl "https://example.com" ^\n  -H "Accept: */*"', "cmd")).toEqual([
            "curl",
            "https://example.com",
            "-H",
            "Accept: */*",
        ]);
    });

    test("reads the caret-and-backslash JSON body Chrome copies", () => {
        // Two layers: cmd resolves `^`, then curl's own C runtime resolves `\"`.
        expect(tokensOf('curl --data-raw ^"{\\^"a\\^":1}^"', "cmd")).toEqual([
            "curl",
            "--data-raw",
            '{"a":1}',
        ]);
    });

    test("reads a doubled quote inside a quoted run", () => {
        expect(tokensOf('curl -d "say ""hi"" now"', "cmd")).toEqual(["curl", "-d", 'say "hi" now']);
    });

    test("halves backslashes only when they precede a quote", () => {
        expect(tokensOf('curl -d "C:\\path\\\\" -k', "cmd")).toEqual([
            "curl",
            "-d",
            "C:\\path\\",
            "-k",
        ]);
    });

    test("reports an unbalanced quote", () => {
        expect(tokenize('curl "https://example.com', "cmd")).toEqual({
            ok: false,
            reason: "unbalanced_quote",
        });
    });
});

describe("tokenize — PowerShell", () => {
    test("follows a backtick continuation", () => {
        expect(
            tokensOf('curl.exe "https://example.com" `\n  -H "Accept: */*"', "powershell"),
        ).toEqual(["curl.exe", "https://example.com", "-H", "Accept: */*"]);
    });

    test("treats a literal string as literal, doubling to escape a quote", () => {
        expect(tokensOf("curl.exe -d 'it''s \\n here'", "powershell")).toEqual([
            "curl.exe",
            "-d",
            "it's \\n here",
        ]);
    });

    test("resolves backtick escapes inside an expandable string", () => {
        expect(tokensOf('curl.exe -d "a`"b`nc"', "powershell")).toEqual([
            "curl.exe",
            "-d",
            'a"b\nc',
        ]);
    });

    test("leaves a backslash alone, since PowerShell is not an escape character", () => {
        expect(tokensOf('curl.exe -d "C:\\path"', "powershell")).toEqual([
            "curl.exe",
            "-d",
            "C:\\path",
        ]);
    });
});
