import { describe, expect, test } from "bun:test";

import { DEFAULT_CURL_OPTIONS } from "@/modules/curl/domain/constants";
import { emitCurl, quoteArgument } from "@/modules/curl/domain/emit-curl";
import { parseCurl } from "@/modules/curl/domain/parse-curl";
import { tokenize } from "@/modules/curl/domain/tokenize";
import { SHELL_DIALECTS, type CurlOptions, type HttpRequest } from "@/modules/curl/types";

const ONE_LINE: CurlOptions = { ...DEFAULT_CURL_OPTIONS, multiLine: false };

function requestFrom(command: string): HttpRequest {
    const result = parseCurl(command);

    if (!result.ok) {
        throw new Error(`expected a request, got ${result.reason}`);
    }

    return result.request;
}

function emit(command: string, options: Partial<CurlOptions> = {}): string {
    return emitCurl(requestFrom(command), { ...ONE_LINE, ...options }).output;
}

describe("quoteArgument", () => {
    const AWKWARD = [
        "plain",
        "has space",
        "it's here",
        '{"a":"b"}',
        "a\\b",
        "C:\\path\\",
        "semi;colon|pipe&amp",
        "$HOME `whoami`",
        "*glob*?",
        "→ unicode ←",
        "",
    ];

    // The one guarantee a hand-rolled quoter can make on its own: whatever it
    // writes, its own reader gets the same string back. The POSIX half is also
    // checked against /bin/sh separately — see the module notes.
    for (const dialect of SHELL_DIALECTS) {
        test(`round-trips every awkward argument through ${dialect}`, () => {
            for (const value of AWKWARD) {
                const quoted = quoteArgument(value, dialect);
                const read = tokenize(`curl ${quoted}`, dialect);

                expect(read.ok).toBe(true);

                if (read.ok) {
                    expect(read.tokens).toEqual(["curl", value]);
                }
            }
        });
    }

    test("leaves an ordinary token unquoted in POSIX", () => {
        expect(quoteArgument("https://example.com/a-b_c.json", "posix")).toBe(
            "https://example.com/a-b_c.json",
        );
    });

    test("uses the close-escape-reopen idiom for a POSIX single quote", () => {
        expect(quoteArgument("it's", "posix")).toBe("'it'\\''s'");
    });

    test("doubles a PowerShell quote rather than escaping it", () => {
        expect(quoteArgument("it's", "powershell")).toBe("'it''s'");
    });

    test("escapes a cmd quote the way curl's own runtime reads it", () => {
        expect(quoteArgument('{"a":1}', "cmd")).toBe('"{\\"a\\":1}"');
    });
});

describe("emitCurl", () => {
    test("omits -X for a method curl would already have used", () => {
        expect(emit("curl https://example.com")).toBe("curl https://example.com");
        expect(emit("curl https://example.com -d 'a=1'")).toContain("--data-raw");
        expect(emit("curl https://example.com -d 'a=1'")).not.toContain("-X POST");
    });

    test("writes -X when asked to be explicit", () => {
        expect(emit("curl https://example.com", { explicitMethod: true })).toBe(
            "curl https://example.com -X GET",
        );
    });

    test("writes -X for a method curl could not have inferred", () => {
        expect(emit("curl -X DELETE https://example.com/1")).toBe(
            "curl https://example.com/1 -X DELETE",
        );
    });

    test("switches to long flags on request", () => {
        expect(emit("curl https://example.com -L -k", { longFlags: true })).toBe(
            "curl https://example.com --location --insecure",
        );
    });

    test("breaks the command with the dialect's own continuation", () => {
        expect(emit("curl https://example.com -L", { multiLine: true })).toBe(
            "curl https://example.com \\\n-L",
        );
        expect(emit("curl https://example.com -L", { multiLine: true, shell: "cmd" })).toContain(
            " ^\n",
        );
        expect(
            emit("curl https://example.com -L", { multiLine: true, shell: "powershell" }),
        ).toContain(" `\n");
    });

    test("names curl.exe under PowerShell, where curl is something else", () => {
        expect(emit("curl https://example.com", { shell: "powershell" })).toStartWith("curl.exe ");
    });

    test("merges cookies back into one -b", () => {
        expect(emit("curl https://example.com -H 'Cookie: a=1' -b 'b=2'")).toContain(
            "-b 'a=1; b=2'",
        );
    });

    test("uses --data-raw so a payload opening with @ is not read as a file", () => {
        // `-d @notafile` would open a file; `--data-raw` never does, which is
        // why the body always leaves through it whatever the flag length says.
        expect(emit("curl https://example.com --data-raw '@notafile'")).toContain(
            "--data-raw @notafile",
        );
    });

    test("writes out the Content-Type curl was sending implicitly", () => {
        expect(emit("curl https://example.com -d 'a=1'")).toContain(
            "-H 'Content-Type: application/x-www-form-urlencoded'",
        );
    });

    test("drops the multipart Content-Type, since curl writes the boundary", () => {
        const result = emitCurl(requestFrom("curl https://example.com -F 'a=1'"), ONE_LINE);

        expect(result.output).not.toContain("multipart/form-data");
        expect(result.output).toContain("-F a=1");
        expect(result.notes).toContainEqual({ id: "multipartBoundary", kind: "adapted" });
    });

    test("writes a file part back with its path and type", () => {
        // Quoted, and it has to be: an unquoted `;` would end the command and
        // hand `type=image/png` to the shell as a program to run.
        expect(emit("curl https://example.com -F 'photo=@shot.png;type=image/png'")).toContain(
            "-F 'photo=@shot.png;type=image/png'",
        );
    });

    test("reaches for --form-string when a literal value opens with @", () => {
        expect(emit("curl https://example.com --form-string 'to=@ada'")).toContain(
            "--form-string to=@ada",
        );
    });

    test("keeps a non-basic scheme flag alongside the credentials", () => {
        const output = emit("curl https://example.com --digest -u 'ada:lovelace'");

        expect(output).toContain("-u ada:lovelace");
        expect(output).toContain("--digest");
    });

    test("says when a value cannot survive the dialect it is quoted for", () => {
        const request = requestFrom("curl https://example.com --data-raw $'a\\nb'");
        const result = emitCurl(request, { ...ONE_LINE, shell: "cmd" });

        expect(result.notes).toContainEqual({
            id: "shellCannotQuoteNewline",
            kind: "dropped",
        });
    });

    test("carries a newline through the two dialects that can hold one", () => {
        for (const shell of ["posix", "powershell"] as const) {
            const result = emitCurl(requestFrom("curl https://example.com --data-raw $'a\\nb'"), {
                ...ONE_LINE,
                shell,
            });

            expect(result.notes).toEqual([]);
        }
    });
});
