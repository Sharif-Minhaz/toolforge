import { describe, expect, test } from "bun:test";

import { parseCurl, type CurlParseResult } from "@/modules/curl/domain/parse-curl";
import type { HttpRequest } from "@/modules/curl/types";

function parsed(command: string): HttpRequest {
    const result = parseCurl(command);

    if (!result.ok) {
        throw new Error(`expected a request, got ${result.reason}`);
    }

    return result.request;
}

function failure(command: string): Extract<CurlParseResult, { ok: false }> {
    const result = parseCurl(command);

    if (result.ok) {
        throw new Error("expected a failure");
    }

    return result;
}

describe("parseCurl — the request line", () => {
    test("reads the simplest command there is", () => {
        const request = parsed("curl https://example.com");

        expect(request.method).toBe("GET");
        expect(request.url).toBe("https://example.com");
        expect(request.headers).toEqual([]);
        expect(request.body).toEqual({ kind: "none" });
    });

    test("adds the scheme curl itself assumes", () => {
        expect(parsed("curl example.com/health").url).toBe("https://example.com/health");
    });

    test("accepts the URL wherever it appears", () => {
        expect(parsed("curl -H 'Accept: */*' https://example.com -k").url).toBe(
            "https://example.com",
        );
    });

    test("accepts --url as well as a bare argument", () => {
        expect(parsed("curl --url https://example.com").url).toBe("https://example.com");
    });

    test("splits the query string into pairs without rewriting the URL", () => {
        const request = parsed("curl 'https://example.com/s?q=hello+world&page=2&q=again'");

        expect(request.url).toBe("https://example.com/s?q=hello+world&page=2&q=again");
        expect(request.query).toEqual([
            { key: "q", value: "hello world" },
            { key: "page", value: "2" },
            { key: "q", value: "again" },
        ]);
    });

    test("takes the method from -X", () => {
        expect(parsed("curl -X DELETE https://example.com/1").method).toBe("DELETE");
    });

    test("infers POST from a body and PUT from an upload", () => {
        expect(parsed("curl https://example.com -d 'a=1'").method).toBe("POST");
        expect(parsed("curl https://example.com -T ./report.csv").method).toBe("PUT");
    });

    test("infers HEAD from -I", () => {
        const request = parsed("curl -I https://example.com");

        expect(request.method).toBe("HEAD");
        expect(request.transfer.headOnly).toBe(true);
    });

    test("stops at --next and says so", () => {
        const result = parseCurl("curl https://a.example --next https://b.example");

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(result.request.url).toBe("https://a.example");
            expect(result.notes).toContainEqual({ id: "nextRequest", kind: "dropped" });
        }
    });
});

describe("parseCurl — flags", () => {
    test("unbundles boolean short flags", () => {
        const request = parsed("curl -sSL https://example.com");

        expect(request.transfer.silent).toBe(true);
        expect(request.transfer.followRedirects).toBe(true);
    });

    test("takes a value from the tail of a bundle", () => {
        expect(parsed("curl -sXPUT https://example.com").method).toBe("PUT");
    });

    test("takes a value from the next token when the bundle ends", () => {
        expect(parsed("curl -s -X PATCH https://example.com").method).toBe("PATCH");
    });

    test("accepts --flag=value", () => {
        expect(parsed("curl --request=PUT https://example.com").method).toBe("PUT");
    });

    test("honours the --no- prefix", () => {
        expect(parsed("curl -L --no-location https://example.com").transfer.followRedirects).toBe(
            false,
        );
    });

    test("refuses to eat the URL for a flag it has never heard of", () => {
        const result = parseCurl("curl --invented-option https://example.com");

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(result.request.url).toBe("https://example.com");
            expect(result.notes).toContainEqual({
                id: "unknownFlag",
                kind: "dropped",
                detail: "--invented-option",
            });
        }
    });

    test("does consume a value for an unknown flag when it cannot be an address", () => {
        expect(parsed("curl --invented-option someValue https://example.com").url).toBe(
            "https://example.com",
        );
    });

    test("fails when a flag that needs a value has none", () => {
        expect(failure("curl https://example.com -H")).toEqual({
            ok: false,
            reason: "missing_value",
            token: "-H",
        });
    });
});

describe("parseCurl — headers and cookies", () => {
    test("keeps header names exactly as written, in order", () => {
        const request = parsed(
            "curl https://example.com -H 'X-Request-Id: 8f14' -H 'accept: application/json'",
        );

        expect(request.headers).toEqual([
            { name: "X-Request-Id", value: "8f14" },
            { name: "accept", value: "application/json" },
        ]);
    });

    test("reads `Name;` as an empty header and `Name:` as a removal", () => {
        expect(parsed("curl https://example.com -H 'X-Empty;'").headers).toEqual([
            { name: "X-Empty", value: "" },
        ]);
        expect(parsed("curl https://example.com -H 'Accept: */*' -H 'Accept:'").headers).toEqual(
            [],
        );
    });

    test("turns -A, -e and -r into the headers curl sends", () => {
        const request = parsed(
            "curl https://example.com -A 'toolforge/1' -e 'https://ref' -r 0-99",
        );

        expect(request.headers).toEqual([
            { name: "User-Agent", value: "toolforge/1" },
            { name: "Referer", value: "https://ref" },
            { name: "Range", value: "bytes=0-99" },
        ]);
    });

    test("collects cookies from -b and from a Cookie header alike", () => {
        expect(parsed("curl https://example.com -b 'a=1; b=2'").cookies).toEqual([
            { key: "a", value: "1" },
            { key: "b", value: "2" },
        ]);

        const viaHeader = parsed("curl https://example.com -H 'Cookie: a=1; b=2'");

        expect(viaHeader.cookies).toEqual([
            { key: "a", value: "1" },
            { key: "b", value: "2" },
        ]);
        expect(viaHeader.headers).toEqual([]);
    });

    test("tells a cookie jar path apart from a pair list", () => {
        const request = parsed("curl https://example.com -b ./cookies.txt");

        expect(request.cookies).toEqual([]);
        expect(request.transfer.cookieFile).toBe("./cookies.txt");
    });
});

describe("parseCurl — bodies", () => {
    test("defaults -d to form encoding, as curl does", () => {
        const request = parsed("curl https://example.com -d 'name=Ada&role=admin'");

        expect(request.body).toEqual({
            kind: "urlencoded",
            fields: [
                { key: "name", value: "Ada" },
                { key: "role", value: "admin" },
            ],
        });
        expect(request.headers).toEqual([
            { name: "Content-Type", value: "application/x-www-form-urlencoded" },
        ]);
    });

    test("joins repeated -d values with an ampersand", () => {
        expect(parsed("curl https://example.com -d 'a=1' -d 'b=2'").body).toEqual({
            kind: "urlencoded",
            fields: [
                { key: "a", value: "1" },
                { key: "b", value: "2" },
            ],
        });
    });

    test("reads a JSON body when the header says so", () => {
        expect(
            parsed(
                `curl https://example.com -H 'Content-Type: application/json' --data-raw '{"a":1}'`,
            ).body,
        ).toEqual({ kind: "json", text: '{"a":1}' });
    });

    test("keeps a payload raw when it is neither form nor JSON", () => {
        expect(
            parsed("curl https://example.com -H 'Content-Type: text/plain' -d 'just words'").body,
        ).toEqual({ kind: "raw", text: "just words" });
    });

    test("--json brings its two headers with it", () => {
        const request = parsed(`curl https://example.com --json '{"a":1}'`);

        expect(request.body).toEqual({ kind: "json", text: '{"a":1}' });
        expect(request.headers).toEqual([
            { name: "Content-Type", value: "application/json" },
            { name: "Accept", value: "application/json" },
        ]);
    });

    test("percent-encodes only the right half of --data-urlencode", () => {
        expect(
            parsed("curl https://example.com --data-urlencode 'name=Ada Lovelace'").body,
        ).toEqual({ kind: "urlencoded", fields: [{ key: "name", value: "Ada Lovelace" }] });
    });

    test("encodes the whole argument when --data-urlencode is given no name", () => {
        expect(parsed("curl https://example.com --data-urlencode 'a b&c'").body).toEqual({
            kind: "raw",
            text: "a%20b%26c",
        });
    });

    test("reads -d @file as a file reference, not as text", () => {
        expect(parsed("curl https://example.com -d @payload.json").body).toEqual({
            kind: "file",
            path: "payload.json",
            binary: false,
        });
    });

    test("--data-raw never treats a leading @ as a filename", () => {
        expect(parsed("curl https://example.com --data-raw '@notafile'").body).toEqual({
            kind: "raw",
            text: "@notafile",
        });
    });

    test("reads every shape -F accepts", () => {
        const request = parsed(
            "curl https://example.com -F 'name=Ada' -F 'photo=@shot.png;type=image/png' -F 'doc=@a.pdf;filename=report.pdf'",
        );

        expect(request.body).toEqual({
            kind: "multipart",
            parts: [
                { name: "name", value: "Ada", filename: null, contentType: null },
                {
                    name: "photo",
                    value: "shot.png",
                    filename: "shot.png",
                    contentType: "image/png",
                },
                { name: "doc", value: "a.pdf", filename: "report.pdf", contentType: null },
            ],
        });
    });

    test("--form-string keeps an @ as text", () => {
        expect(parsed("curl https://example.com --form-string 'to=@ada'").body).toEqual({
            kind: "multipart",
            parts: [{ name: "to", value: "@ada", filename: null, contentType: null }],
        });
    });

    test("-G folds the data into the query and leaves no body", () => {
        const result = parseCurl("curl -G https://example.com/s -d 'q=cats' -d 'page=2'");

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(result.request.url).toBe("https://example.com/s?q=cats&page=2");
            expect(result.request.method).toBe("GET");
            expect(result.request.body).toEqual({ kind: "none" });
            expect(result.request.headers).toEqual([]);
            expect(result.notes).toContainEqual({ id: "getWithBody", kind: "adapted" });
        }
    });
});

describe("parseCurl — credentials and transfer", () => {
    test("splits -u at the first colon only", () => {
        expect(parsed("curl https://example.com -u 'ada:pass:word'").auth).toEqual({
            scheme: "basic",
            user: "ada",
            password: "pass:word",
            token: "",
        });
    });

    test("carries the scheme flag onto the credentials", () => {
        expect(parsed("curl https://example.com --digest -u 'ada:lovelace'").auth?.scheme).toBe(
            "digest",
        );
    });

    test("reads --oauth2-bearer as a bearer token", () => {
        expect(parsed("curl https://example.com --oauth2-bearer sk_live_1").auth).toEqual({
            scheme: "bearer",
            user: "",
            password: "",
            token: "sk_live_1",
        });
    });

    test("collects the transfer options", () => {
        const request = parsed(
            "curl https://example.com -L --max-redirs 3 -k --compressed -x http://proxy:8080 -m 15 --connect-timeout 2 --http2 --unix-socket /var/run/d.sock --retry 4 -o out.json",
        );

        expect(request.transfer).toMatchObject({
            followRedirects: true,
            maxRedirects: 3,
            insecure: true,
            compressed: true,
            proxy: "http://proxy:8080",
            maxTimeSeconds: 15,
            connectTimeoutSeconds: 2,
            httpVersion: "http2",
            unixSocket: "/var/run/d.sock",
            retry: 4,
            outputPath: "out.json",
        });
    });
});

describe("parseCurl — failures", () => {
    test("names an empty input", () => {
        expect(failure("   ").reason).toBe("empty");
    });

    test("names something that is not a curl command", () => {
        expect(failure("wget https://example.com").reason).toBe("not_curl");
    });

    test("names a command with no address in it", () => {
        expect(failure("curl -X POST -H 'Accept: */*'").reason).toBe("no_url");
    });

    test("names an unbalanced quote", () => {
        expect(failure("curl 'https://example.com").reason).toBe("unbalanced_quote");
    });
});
