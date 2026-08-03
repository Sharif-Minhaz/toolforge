import { describe, expect, test } from "bun:test";

import { asString, entryOf, JsReader, scanSource } from "@/modules/curl/domain/js-value";
import { parseFetch } from "@/modules/curl/domain/parse-fetch";
import type { HttpRequest } from "@/modules/curl/types";

function parsed(snippet: string): HttpRequest {
    const result = parseFetch(snippet);

    if (!result.ok) {
        throw new Error(`expected a request, got ${result.reason}`);
    }

    return result.request;
}

function value(source: string) {
    return new JsReader(source).readValue();
}

describe("JsReader", () => {
    test("reads the literals a fetch init is made of", () => {
        expect(value('"hello"')).toEqual({ kind: "string", value: "hello" });
        expect(value("'hello'")).toEqual({ kind: "string", value: "hello" });
        expect(value("15000")).toEqual({ kind: "number", value: 15000 });
        expect(value("true")).toEqual({ kind: "boolean", value: true });
        expect(value("null")).toEqual({ kind: "null" });
    });

    test("decodes string escapes, including the hex and unicode forms", () => {
        expect(value('"a\\nb\\tc"')).toEqual({ kind: "string", value: "a\nb\tc" });
        expect(value('"\\x41\\u00e9\\u{1F600}"')).toEqual({ kind: "string", value: "Aé😀" });
    });

    test("reads a template literal that holds no substitution", () => {
        expect(value("`plain text`")).toEqual({ kind: "string", value: "plain text" });
    });

    test("keeps a template literal with a substitution as source text", () => {
        expect(value("`https://x/${id}`")).toEqual({
            kind: "raw",
            text: "`https://x/${id}`",
        });
    });

    test("folds a concatenation of string literals", () => {
        expect(value('"https://example.com" + "/v1/users"')).toEqual({
            kind: "string",
            value: "https://example.com/v1/users",
        });
    });

    test("falls back to source text when a concatenation is not all literals", () => {
        expect(value('"https://example.com/" + id')).toEqual({
            kind: "raw",
            text: '"https://example.com/" + id',
        });
    });

    test("reads an object, including quoted and shorthand keys", () => {
        const read = value('{ method: "POST", "Content-Type": "application/json", headers }');

        expect(asString(entryOf(read, "method"))).toBe("POST");
        expect(asString(entryOf(read, "content-type"))).toBe("application/json");
        expect(entryOf(read, "headers")).toEqual({ kind: "identifier", name: "headers" });
    });

    test("reads a call and a construction", () => {
        expect(value("JSON.stringify({ a: 1 })")).toMatchObject({
            kind: "call",
            callee: "JSON.stringify",
            isNew: false,
        });
        expect(value('new Headers({ Accept: "*/*" })')).toMatchObject({
            kind: "call",
            callee: "Headers",
            isNew: true,
        });
    });

    test("skips both comment forms", () => {
        expect(value('/* leading */ "value" // trailing')).toEqual({
            kind: "string",
            value: "value",
        });
    });
});

describe("scanSource", () => {
    test("collects declarations and calls in one pass", () => {
        const scan = scanSource(
            'const form = new FormData();\nform.append("a", "1");\nfetch("https://example.com", { body: form });',
        );

        expect(scan.declarations.get("form")).toMatchObject({ kind: "call", callee: "FormData" });
        // The construction counts too — a call inside a declaration is still a
        // call, which is what lets `const r = await fetch(…)` be found at all.
        expect(scan.calls.map((call) => call.callee)).toEqual(["FormData", "form.append", "fetch"]);
    });

    test("does not mistake the word fetch inside a string for a call", () => {
        const scan = scanSource('const note = "call fetch(url) later";');

        expect(scan.calls).toEqual([]);
    });

    test("survives a statement written without a semicolon", () => {
        const scan = scanSource('const a = JSON.stringify({ x: 1 })\nconst b = "second"');

        expect(scan.declarations.get("a")).toMatchObject({ kind: "call" });
        expect(scan.declarations.get("b")).toEqual({ kind: "string", value: "second" });
    });
});

describe("parseFetch", () => {
    test("reads the shape almost every snippet is written in", () => {
        const request = parsed(`
            const response = await fetch("https://api.example.com/v1/users?page=2", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ name: "Ada", role: "admin" }),
            });
        `);

        expect(request.method).toBe("POST");
        expect(request.url).toBe("https://api.example.com/v1/users?page=2");
        expect(request.query).toEqual([{ key: "page", value: "2" }]);
        expect(request.headers).toEqual([
            { name: "Content-Type", value: "application/json" },
            { name: "Accept", value: "application/json" },
        ]);
        expect(request.body).toEqual({ kind: "json", text: '{"name":"Ada","role":"admin"}' });
    });

    test("defaults the method to GET, and to POST when there is a body", () => {
        expect(parsed('fetch("https://example.com")').method).toBe("GET");
        expect(parsed('fetch("https://example.com", { body: "a=1" })').method).toBe("POST");
    });

    test("carries fetch's redirect default across, not its absence", () => {
        // fetch follows unless told otherwise; curl does the opposite, so
        // silence here has to become `-L` rather than nothing.
        expect(parsed('fetch("https://example.com")').transfer.followRedirects).toBe(true);
        expect(
            parsed('fetch("https://example.com", { redirect: "manual" })').transfer.followRedirects,
        ).toBe(false);
    });

    test("reads headers written as an array, a Headers instance, or a variable", () => {
        const expected = [{ name: "Accept", value: "*/*" }];

        expect(parsed('fetch("https://x", { headers: [["Accept", "*/*"]] })').headers).toEqual(
            expected,
        );
        expect(
            parsed('fetch("https://x", { headers: new Headers({ Accept: "*/*" }) })').headers,
        ).toEqual(expected);
        expect(
            parsed('const headers = { Accept: "*/*" };\nfetch("https://x", { headers });').headers,
        ).toEqual(expected);
    });

    test("picks up headers set after the object was built", () => {
        expect(
            parsed(
                'const headers = new Headers();\nheaders.set("Accept", "*/*");\nfetch("https://x", { headers });',
            ).headers,
        ).toEqual([{ name: "Accept", value: "*/*" }]);
    });

    test("moves a Cookie header into the cookie list", () => {
        const request = parsed('fetch("https://x", { headers: { Cookie: "a=1; b=2" } })');

        expect(request.headers).toEqual([]);
        expect(request.cookies).toEqual([
            { key: "a", value: "1" },
            { key: "b", value: "2" },
        ]);
    });

    test("reads a URLSearchParams body as form fields", () => {
        expect(
            parsed('fetch("https://x", { body: new URLSearchParams({ a: "1", b: "2" }) })').body,
        ).toEqual({
            kind: "urlencoded",
            fields: [
                { key: "a", value: "1" },
                { key: "b", value: "2" },
            ],
        });
    });

    test("reads a URLSearchParams built from a query string", () => {
        expect(parsed('fetch("https://x", { body: new URLSearchParams("a=1&b=2") })').body).toEqual(
            {
                kind: "urlencoded",
                fields: [
                    { key: "a", value: "1" },
                    { key: "b", value: "2" },
                ],
            },
        );
    });

    test("reassembles a FormData from the appends around the call", () => {
        expect(
            parsed(
                'const form = new FormData();\nform.append("name", "Ada");\nform.append("photo", photoFile, "shot.png");\nfetch("https://x", { method: "POST", body: form });',
            ).body,
        ).toEqual({
            kind: "multipart",
            parts: [
                { name: "name", value: "Ada", filename: null, contentType: null },
                { name: "photo", value: "shot.png", filename: "shot.png", contentType: null },
            ],
        });
    });

    test("reads a timeout signal back as a transfer limit", () => {
        expect(
            parsed('fetch("https://x", { signal: AbortSignal.timeout(15000) })').transfer
                .maxTimeSeconds,
        ).toBe(15);
    });

    test("reads an undici dispatcher back into the flags that produced it", () => {
        expect(
            parsed(
                'fetch("https://x", { dispatcher: new Agent({ connect: { rejectUnauthorized: false } }) })',
            ).transfer.insecure,
        ).toBe(true);
        expect(
            parsed('fetch("https://x", { dispatcher: new ProxyAgent("http://proxy:8080") })')
                .transfer.proxy,
        ).toBe("http://proxy:8080");
    });

    test("keeps the fetch-only init fields it cannot translate", () => {
        const transfer = parsed(
            'fetch("https://x", { credentials: "include", mode: "cors", cache: "no-store" })',
        ).transfer;

        expect(transfer).toMatchObject({
            credentials: "include",
            mode: "cors",
            cache: "no-store",
        });
    });

    test("resolves a URL built with the URL constructor", () => {
        expect(parsed('fetch(new URL("/v1/users", "https://api.example.com"))').url).toBe(
            "https://api.example.com/v1/users",
        );
    });

    test("finds the call however it is written", () => {
        expect(parsed('window.fetch("https://example.com");').url).toBe("https://example.com");
        expect(parsed('fetch("https://example.com").then((r) => r.json());').url).toBe(
            "https://example.com",
        );
    });

    test("names a snippet with no fetch in it", () => {
        expect(parseFetch("const a = 1;")).toEqual({ ok: false, reason: "no_request_call" });
    });

    test("names a URL it cannot resolve rather than guessing", () => {
        const result = parseFetch("fetch(`https://example.com/${id}`)");

        expect(result).toMatchObject({ ok: false, reason: "unsupported_expression" });
    });
});
