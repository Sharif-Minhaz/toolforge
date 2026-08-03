import { describe, expect, test } from "bun:test";

import { DEFAULT_CODE_OPTIONS } from "@/modules/curl/domain/constants";
import { emitCode } from "@/modules/curl/domain/convert";
import { parseCurl } from "@/modules/curl/domain/parse-curl";
import type { CodeOptions, ConversionNoteId, HttpRequest } from "@/modules/curl/types";

function requestFrom(command: string): HttpRequest {
    const result = parseCurl(command);

    if (!result.ok) {
        throw new Error(`expected a request, got ${result.reason}`);
    }

    return result.request;
}

function emit(command: string, options: Partial<CodeOptions> = {}) {
    return emitCode(requestFrom(command), { ...DEFAULT_CODE_OPTIONS, ...options });
}

function noteIds(command: string, options: Partial<CodeOptions> = {}): ConversionNoteId[] {
    return emit(command, options).notes.map((note) => note.id);
}

describe("emitFetch", () => {
    test("writes the plainest call with no init object at all", () => {
        expect(emit("curl https://example.com", { includeResponse: false }).output).toBe(
            'const response = await fetch("https://example.com");',
        );
    });

    test("writes headers, method and a JSON body as an object literal", () => {
        const output = emit(
            `curl https://example.com -H 'Content-Type: application/json' --data-raw '{"name":"Ada","tags":["a","b"]}'`,
            { includeResponse: false },
        ).output;

        expect(output).toBe(
            [
                'const response = await fetch("https://example.com", {',
                '  method: "POST",',
                "  headers: {",
                '    "Content-Type": "application/json",',
                "  },",
                "  body: JSON.stringify({",
                '    name: "Ada",',
                "    tags: [",
                '      "a",',
                '      "b",',
                "    ],",
                "  }),",
                "});",
            ].join("\n"),
        );
    });

    test("adds the status check and the body read when asked", () => {
        const output = emit("curl https://example.com -H 'Accept: application/json'").output;

        expect(output).toContain("if (!response.ok) {");
        expect(output).toContain("const data = await response.json();");
    });

    test("reads the response as text when nothing suggests JSON", () => {
        expect(emit("curl https://example.com -H 'Accept: text/html'").output).toContain(
            "await response.text()",
        );
    });

    test("writes a promise chain instead when asked", () => {
        const output = emit("curl https://example.com", { style: "promiseChain" }).output;

        expect(output).toContain(".then((response) => {");
        expect(output).toContain(".catch((error) => {");
        expect(output).not.toContain("await");
    });

    test("wraps the headers in a Headers instance on request", () => {
        expect(
            emit("curl https://example.com -H 'Accept: */*'", { headersStyle: "headersInstance" })
                .output,
        ).toContain("headers: new Headers({");
    });

    test("turns -u into the Authorization header it actually sends", () => {
        expect(emit("curl https://example.com -u 'ada:lovelace'").output).toContain(
            'Authorization: "Basic YWRhOmxvdmVsYWNl"',
        );
    });

    test("turns a form body into URLSearchParams", () => {
        expect(emit("curl https://example.com -d 'a=1&b=2'").output).toContain(
            "body: new URLSearchParams({",
        );
    });

    test("builds a FormData above the call and drops the boundary header", () => {
        const result = emit("curl https://example.com -F 'name=Ada' -F 'photo=@shot.png'");

        expect(result.output).toContain("const form = new FormData();");
        expect(result.output).toContain('form.append("name", "Ada");');
        expect(result.output).toContain('form.append("photo", photoFile, "shot.png");');
        expect(result.output).toContain("body: form,");
        expect(result.output).not.toContain("multipart/form-data");
        expect(result.notes.map((note) => note.id)).toContain("multipartBoundary");
    });

    test("says a browser will not send the Cookie header, and sends the jar instead", () => {
        const result = emit("curl https://example.com -b 'a=1'");

        expect(result.output).toContain('credentials: "include"');
        expect(result.output).not.toContain("Cookie");
        expect(result.notes.map((note) => note.id)).toContain("cookieHeaderForbidden");
    });

    test("does set the Cookie header when the snippet is for Node", () => {
        const result = emit("curl https://example.com -b 'a=1'", { runtime: "node" });

        expect(result.output).toContain('Cookie: "a=1"');
        expect(result.notes.map((note) => note.id)).not.toContain("cookieHeaderForbidden");
    });

    test("writes redirect: manual on Node, because curl does not follow without -L", () => {
        expect(emit("curl https://example.com", { runtime: "node" }).output).toContain(
            'redirect: "manual"',
        );
        expect(noteIds("curl https://example.com", { runtime: "node" })).toContain(
            "redirectManual",
        );
    });

    test("leaves it out in a browser, where manual means an opaque response", () => {
        expect(emit("curl https://example.com").output).not.toContain("redirect:");
        expect(noteIds("curl https://example.com")).toContain("redirectFollows");
    });

    test("says nothing about redirects when -L already agrees with fetch", () => {
        const result = emit("curl https://example.com -L");

        expect(result.output).not.toContain("redirect:");
        expect(result.notes.map((note) => note.id)).not.toContain("redirectFollows");
    });

    test("turns --max-time into an abort signal", () => {
        expect(emit("curl https://example.com -m 15").output).toContain(
            "signal: AbortSignal.timeout(15000)",
        );
    });

    test("drops --insecure in a browser and reaches for undici in Node", () => {
        expect(noteIds("curl https://example.com -k")).toContain("insecureTls");

        const onNode = emit("curl https://example.com -k", { runtime: "node" });

        expect(onNode.output).toContain('import { Agent } from "undici";');
        expect(onNode.output).toContain(
            "dispatcher: new Agent({ connect: { rejectUnauthorized: false } })",
        );
        expect(onNode.notes.map((note) => note.id)).toContain("insecureViaDispatcher");
    });

    test("folds a proxy and an insecure flag into one dispatcher", () => {
        expect(
            emit("curl https://example.com -k -x http://proxy:8080", { runtime: "node" }).output,
        ).toContain(
            'dispatcher: new ProxyAgent({ uri: "http://proxy:8080", requestTls: { rejectUnauthorized: false } })',
        );
    });

    test("names everything fetch has no word for", () => {
        const ids = noteIds(
            "curl https://example.com --max-redirs 3 --connect-timeout 2 --cert c.pem --cacert ca.pem --unix-socket /s.sock --retry 4 --http2 -o out.json -v --interface eth0 --resolve a:1:2 -n",
        );

        expect(ids).toEqual(
            expect.arrayContaining([
                "maxRedirects",
                "connectTimeout",
                "clientCert",
                "caCert",
                "unixSocket",
                "retry",
                "httpVersion",
                "outputFile",
                "transportOnly",
                "interfaceName",
                "resolveHost",
                "netrc",
            ]),
        );
    });

    test("says a challenge-response scheme cannot be precomputed", () => {
        expect(noteIds("curl https://example.com --digest -u 'ada:lovelace'")).toContain(
            "digestAuth",
        );
    });
});

describe("emitAxios", () => {
    test("writes the config object axios takes", () => {
        const output = emit("curl -X PUT https://example.com/1 -H 'Accept: */*'", {
            target: "axios",
            includeResponse: false,
        }).output;

        expect(output).toStartWith('import axios from "axios";');
        expect(output).toContain('method: "put",');
        expect(output).toContain('url: "https://example.com/1",');
    });

    test("uses the first-class auth option for basic credentials", () => {
        expect(
            emit("curl https://example.com -u 'ada:lovelace'", { target: "axios" }).output,
        ).toContain('username: "ada",');
    });

    test("cannot refuse a redirect in a browser, and says so", () => {
        expect(noteIds("curl https://example.com", { target: "axios" })).toContain(
            "redirectFollows",
        );
        expect(noteIds("curl -L https://example.com", { target: "axios" })).not.toContain(
            "redirectFollows",
        );
    });

    test("expresses redirect limits, which fetch cannot", () => {
        expect(
            emit("curl https://example.com", { target: "axios", runtime: "node" }).output,
        ).toContain("maxRedirects: 0,");
        expect(
            emit("curl https://example.com -L --max-redirs 3", {
                target: "axios",
                runtime: "node",
            }).output,
        ).toContain("maxRedirects: 3,");
    });

    test("breaks a proxy URL into the shape axios wants", () => {
        expect(
            emit("curl https://example.com -x http://joe:secret@proxy:8080", {
                target: "axios",
                runtime: "node",
            }).output,
        ).toContain('host: "proxy",');
    });

    test("carries certificates through an https agent", () => {
        const output = emit(
            "curl https://example.com --cert c.pem --key c.key --cacert ca.pem -k",
            {
                target: "axios",
                runtime: "node",
            },
        ).output;

        expect(output).toContain('import https from "node:https";');
        expect(output).toContain("httpsAgent: new https.Agent({");
        expect(output).toContain('cert: readFileSync("c.pem"),');
        expect(output).toContain("rejectUnauthorized: false,");
    });

    test("loses those same options in a browser, and says so", () => {
        const ids = noteIds("curl https://example.com --cert c.pem -k -x http://proxy:8080", {
            target: "axios",
            runtime: "browser",
        });

        expect(ids).toEqual(expect.arrayContaining(["insecureTls", "proxy", "clientCert"]));
    });
});

describe("emitNodeHttp", () => {
    test("splits the URL into the fields node:https asks for", () => {
        const output = emit("curl 'https://api.example.com:8443/v1/users?page=2'", {
            target: "nodeHttp",
        }).output;

        expect(output).toStartWith('import https from "node:https";');
        expect(output).toContain('hostname: "api.example.com",');
        expect(output).toContain("port: 8443,");
        expect(output).toContain('path: "/v1/users?page=2",');
    });

    test("imports node:http for a plain http address", () => {
        expect(emit("curl http://example.com", { target: "nodeHttp" }).output).toStartWith(
            'import http from "node:http";',
        );
    });

    test("writes the payload and the Content-Length that goes with it", () => {
        const output = emit(`curl https://example.com --json '{"a":1}'`, {
            target: "nodeHttp",
        }).output;

        // Single-quoted, because the payload holds double quotes and no single
        // ones — the literal that needs no escapes is the one to write.
        expect(output).toContain(`const payload = '{"a":1}';`);
        expect(output).toContain('"Content-Length": Buffer.byteLength(payload),');
        expect(output).toContain("request.write(payload);");
    });

    test("says outright that node:https will not follow a redirect", () => {
        expect(noteIds("curl -L https://example.com", { target: "nodeHttp" })).toContain(
            "redirectsNotFollowed",
        );
    });

    test("has no multipart writer, and says so rather than inventing a boundary", () => {
        expect(noteIds("curl https://example.com -F 'a=1'", { target: "nodeHttp" })).toContain(
            "multipartUnsupported",
        );
    });

    test("carries the flags it does have a field for", () => {
        const output = emit(
            "curl https://example.com -k -m 15 --unix-socket /var/run/d.sock --cacert ca.pem",
            { target: "nodeHttp" },
        ).output;

        expect(output).toContain("rejectUnauthorized: false,");
        expect(output).toContain("timeout: 15000,");
        expect(output).toContain('socketPath: "/var/run/d.sock",');
        expect(output).toContain('ca: readFileSync("ca.pem"),');
    });
});

describe("generated code", () => {
    // A snippet that does not parse is worse than no snippet: it looks like an
    // answer. Every emitter's output is fed to a real parser here.
    const COMMANDS = [
        "curl https://example.com",
        `curl https://example.com -H 'Content-Type: application/json' --data-raw '{"a":1,"b":[1,2],"c":"it'\\''s"}'`,
        "curl https://example.com -F 'name=Ada' -F 'photo=@shot.png;type=image/png'",
        "curl https://example.com -d 'a=1&b=2' -u 'ada:lovelace' -b 'x=1' -L -k -m 5",
        "curl -X DELETE https://example.com/1 --oauth2-bearer sk_live_1",
        "curl https://example.com --data-raw $'line1\\nline2' -H 'X-Odd: a`b${c}'",
        "curl https://example.com --cert c.pem --key c.key --cacert ca.pem -x http://proxy:8080",
    ];

    for (const target of ["fetch", "axios", "nodeHttp"] as const) {
        for (const runtime of ["browser", "node"] as const) {
            test(`is syntactically valid for ${target} on ${runtime}`, () => {
                for (const command of COMMANDS) {
                    const { output } = emit(command, { target, runtime });
                    // Imports and top-level await are only legal inside a
                    // module, which is what `new Function` cannot be — so the
                    // check runs over the module goal via a Blob-free parse.
                    const source = output
                        .split("\n")
                        .filter((line) => !line.startsWith("import "))
                        .join("\n");

                    expect(() => new Function(`async () => {\n${source}\n}`)).not.toThrow();
                }
            });
        }
    }
});
