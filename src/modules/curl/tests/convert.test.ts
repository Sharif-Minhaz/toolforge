import { describe, expect, test } from "bun:test";

import {
    DEFAULT_CODE_OPTIONS,
    DEFAULT_CURL_OPTIONS,
    SAMPLE_CURL,
    SAMPLE_FETCH,
} from "@/modules/curl/domain/constants";
import { convert } from "@/modules/curl/domain/convert";
import { emitCurl } from "@/modules/curl/domain/emit-curl";
import { emitFetch, withAuthorizationHeader } from "@/modules/curl/domain/emit-fetch";
import { parseCurl } from "@/modules/curl/domain/parse-curl";
import { parseFetch } from "@/modules/curl/domain/parse-fetch";
import { SHELL_DIALECTS, type HttpRequest } from "@/modules/curl/types";

/**
 * The invariant worth testing is not that the text comes back byte for byte —
 * it will not, since `-d` and `--data-raw` say the same thing — but that the
 * *request* does. Comparing the parsed shape is what catches a flag written
 * with the wrong arity or a body quoted into a different string.
 */
function message(request: HttpRequest) {
    const multipart = request.body.kind === "multipart";

    return {
        method: request.method,
        url: request.url,
        // Multipart drops its Content-Type on the way into JavaScript, because
        // the boundary belongs to whatever writes the body.
        headers: withAuthorizationHeader(request)
            .filter((header) => !(multipart && header.name.toLowerCase() === "content-type"))
            .map((header) => `${header.name.toLowerCase()}: ${header.value}`)
            .toSorted(),
        cookies: request.cookies.map((cookie) => `${cookie.key}=${cookie.value}`).toSorted(),
        // A part's declared type does not survive `FormData.append`, which has
        // no argument for one — the browser reads it off the File instead. The
        // `multipartFile` note is where that loss is reported.
        body:
            request.body.kind === "multipart"
                ? {
                      kind: request.body.kind,
                      parts: request.body.parts.map((part) => ({
                          name: part.name,
                          value: part.value,
                          filename: part.filename,
                      })),
                  }
                : request.body,
    };
}

function requestFrom(command: string): HttpRequest {
    const result = parseCurl(command);

    if (!result.ok) {
        throw new Error(`expected a request, got ${result.reason}`);
    }

    return result.request;
}

const COMMANDS = [
    "curl https://example.com",
    "curl -X DELETE 'https://api.example.com/v1/items/42?force=true&reason=broken'",
    `curl https://example.com -H 'Content-Type: application/json' --data-raw '{"name":"Ada O'\\''Hara","depth":{"a":[1,2,null,true]}}'`,
    "curl https://example.com -d 'name=Ada Lovelace&role=admin'",
    "curl https://example.com -F 'name=Ada' -F 'photo=@shot.png;type=image/png'",
    "curl https://example.com -u 'ada:p@ss:word' -b 'session=abc; theme=dark' -L -k --compressed -m 15",
    "curl https://example.com --oauth2-bearer sk_live_8f14 -H 'Accept: application/json'",
    "curl -G https://example.com/search -d 'q=cats' -d 'page=2'",
    "curl -I https://example.com",
    `curl https://example.com --data-raw $'line one\\nline two\\ttabbed'`,
    "curl https://example.com -H 'X-Odd: a`b${c} $HOME' -H 'X-Empty;'",
    "curl https://example.com --max-redirs 3 --connect-timeout 2 --http2 --retry 4 -x http://proxy:8080",
];

describe("curl → curl", () => {
    for (const shell of SHELL_DIALECTS) {
        test(`describes the same request after a trip through ${shell}`, () => {
            for (const command of COMMANDS) {
                const original = requestFrom(command);
                const written = emitCurl(original, { ...DEFAULT_CURL_OPTIONS, shell }).output;
                const reparsed = parseCurl(written);

                expect(reparsed.ok).toBe(true);

                if (reparsed.ok) {
                    expect(reparsed.request).toEqual(original);
                }
            }
        });
    }

    test("settles after one pass — writing it twice changes nothing", () => {
        for (const command of COMMANDS) {
            const once = emitCurl(requestFrom(command), DEFAULT_CURL_OPTIONS).output;
            const twice = emitCurl(requestFrom(once), DEFAULT_CURL_OPTIONS).output;

            expect(twice).toBe(once);
        }
    });

    test("keeps every transfer flag it was given", () => {
        const original = requestFrom(COMMANDS[COMMANDS.length - 1]);
        const reparsed = parseCurl(emitCurl(original, DEFAULT_CURL_OPTIONS).output);

        expect(reparsed.ok).toBe(true);

        if (reparsed.ok) {
            expect(reparsed.request.transfer).toEqual(original.transfer);
        }
    });
});

describe("curl → fetch → curl", () => {
    // A file body cannot survive the trip: `await readFile(…)` is an
    // expression, not a payload, and reading it back would be guesswork.
    const ROUND_TRIPPABLE = COMMANDS.filter((command) => !command.includes("-T "));

    test("carries the message across both boundaries", () => {
        for (const command of ROUND_TRIPPABLE) {
            const original = requestFrom(command);
            const snippet = emitFetch(original, {
                ...DEFAULT_CODE_OPTIONS,
                runtime: "node",
            }).output;
            const reparsed = parseFetch(snippet);

            expect(reparsed.ok).toBe(true);

            if (reparsed.ok) {
                expect(message(reparsed.request)).toEqual(message(original));
            }
        }
    });

    test("keeps whether redirects are followed, which the two spell oppositely", () => {
        for (const [command, expected] of [
            ["curl https://example.com", false],
            ["curl -L https://example.com", true],
        ] as const) {
            const original = requestFrom(command);
            const snippet = emitFetch(original, {
                ...DEFAULT_CODE_OPTIONS,
                runtime: "node",
            }).output;
            const reparsed = parseFetch(snippet);

            expect(reparsed.ok).toBe(true);

            if (reparsed.ok) {
                expect(reparsed.request.transfer.followRedirects).toBe(expected);
            }
        }
    });
});

describe("fetch → curl → fetch", () => {
    const SNIPPETS = [
        'fetch("https://example.com")',
        'fetch("https://example.com", { method: "PUT", headers: { Accept: "*/*" }, body: "raw text" })',
        'fetch("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: 1, b: "two" }) })',
        'fetch("https://example.com", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ a: "1", b: "two words" }) })',
        'fetch("https://example.com", { headers: { Cookie: "a=1; b=2" }, redirect: "manual" })',
        'fetch("https://example.com", { signal: AbortSignal.timeout(15000) })',
    ];

    test("carries the message across both boundaries", () => {
        for (const snippet of SNIPPETS) {
            const original = parseFetch(snippet);

            expect(original.ok).toBe(true);

            if (!original.ok) {
                continue;
            }

            const command = emitCurl(original.request, DEFAULT_CURL_OPTIONS).output;
            const reparsed = parseCurl(command);

            expect(reparsed.ok).toBe(true);

            if (reparsed.ok) {
                expect(message(reparsed.request)).toEqual(message(original.request));
            }
        }
    });
});

describe("convert", () => {
    test("reads the sample command and reports the dialect it was read as", () => {
        const result = convert({
            direction: "curlToCode",
            input: SAMPLE_CURL,
            code: DEFAULT_CODE_OPTIONS,
            curl: DEFAULT_CURL_OPTIONS,
        });

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(result.detectedShell).toBe("posix");
            expect(result.request.method).toBe("POST");
            expect(result.output).toContain("await fetch(");
        }
    });

    test("reads the sample snippet back into a command", () => {
        const result = convert({
            direction: "codeToCurl",
            input: SAMPLE_FETCH,
            code: DEFAULT_CODE_OPTIONS,
            curl: DEFAULT_CURL_OPTIONS,
        });

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(result.detectedShell).toBeNull();
            // Quoted, because `?` would be a glob to the shell.
            expect(result.output).toStartWith("curl 'https://api.example.com/v1/users?page=2'");
            expect(result.output).toContain("-H 'Authorization: Bearer sk_live_8f14e45f'");
            expect(result.output).toContain("-L");
            expect(result.output).toContain("-m 15");
            // `credentials: "include"` has no curl equivalent, and is reported
            // rather than dropped in silence.
            expect(result.notes.map((note) => note.id)).toContain("credentialsIgnored");
        }
    });

    test("raises one note per distinct thing that happened", () => {
        const result = convert({
            direction: "curlToCode",
            input: "curl https://example.com -k -k --cert a.pem --cert a.pem",
            code: DEFAULT_CODE_OPTIONS,
            curl: DEFAULT_CURL_OPTIONS,
        });

        expect(result.ok).toBe(true);

        if (result.ok) {
            const ids = result.notes.map((note) => note.id);

            expect(ids.filter((id) => id === "insecureTls")).toHaveLength(1);
            expect(ids.filter((id) => id === "clientCert")).toHaveLength(1);
        }
    });

    test("passes a failure straight through in either direction", () => {
        expect(
            convert({
                direction: "curlToCode",
                input: "wget https://example.com",
                code: DEFAULT_CODE_OPTIONS,
                curl: DEFAULT_CURL_OPTIONS,
            }),
        ).toEqual({ ok: false, reason: "not_curl" });

        expect(
            convert({
                direction: "codeToCurl",
                input: "const a = 1;",
                code: DEFAULT_CODE_OPTIONS,
                curl: DEFAULT_CURL_OPTIONS,
            }),
        ).toEqual({ ok: false, reason: "no_request_call" });
    });
});
