import type { CodeOptions, ConversionNote, HttpRequest } from "../types";
import { CodeWriter, jsString } from "./code-writer";
import { formatCookieHeader, removeHeader, setHeader } from "./headers";
import { partIdentifier, type EmitCodeResult } from "./emit-fetch";
import { transferNotes } from "./notes";

/** `http://user:pass@proxy:8080` broken into what axios's `proxy` option wants. */
export function parseProxy(value: string): {
    readonly protocol: string;
    readonly host: string;
    readonly port: number | null;
    readonly username: string;
    readonly password: string;
} | null {
    try {
        const url = new URL(value.includes("://") ? value : `http://${value}`);

        return {
            protocol: url.protocol.replace(":", ""),
            host: url.hostname,
            port: url.port.length === 0 ? null : Number(url.port),
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
        };
    } catch {
        return null;
    }
}

/**
 * Writes the request as an axios call.
 *
 * axios is the target that loses least, and the option table is why: it has a
 * name for redirect limits, timeouts, credentials, proxies and a TLS agent,
 * where `fetch` has one of the five. Almost all of that is Node-only though —
 * in a browser axios is XHR, and `proxy`, `maxRedirects` and `httpsAgent` are
 * quietly ignored. So the runtime picker governs what gets written, and the
 * rest becomes notes.
 */
export function emitAxios(request: HttpRequest, options: CodeOptions): EmitCodeResult {
    const writer = new CodeWriter(options.indent);
    const node = options.runtime === "node";
    const notes: ConversionNote[] = [
        ...transferNotes(request, {
            insecure: node,
            proxy: node,
            maxRedirects: node,
            connectTimeout: false,
            clientCert: node,
            caCert: node,
            unixSocket: node,
            retry: false,
            cookieHeader: node,
            bodyFromFile: node,
            httpVersion: false,
        }),
    ];

    const imports: string[] = ['import axios from "axios";'];
    const preamble: string[] = [];
    const config: (readonly [string, string])[] = [];
    const agentOptions: (readonly [string, string])[] = [];
    let headers = request.headers;
    let needsFs = false;

    /* ----------------------------------------------------------- cookies --- */

    if (request.cookies.length > 0 && node) {
        headers = setHeader(headers, "Cookie", formatCookieHeader(request.cookies));
    }

    /* -------------------------------------------------------------- body --- */

    let data: string | null = null;

    switch (request.body.kind) {
        case "none":
            break;
        case "raw":
            data = jsString(request.body.text);
            break;
        case "json": {
            const literal = writer.jsonLiteral(request.body.text, 1);

            // axios serialises a plain object and sets the header itself, so the
            // literal is both shorter and closer to how the call is written.
            data = literal ?? jsString(request.body.text);
            break;
        }
        case "urlencoded":
            data = `new URLSearchParams(${writer.pairs(request.body.fields, 1)})`;
            break;
        case "multipart": {
            preamble.push("const form = new FormData();");

            request.body.parts.forEach((part, index) => {
                if (part.filename === null) {
                    preamble.push(`form.append(${jsString(part.name)}, ${jsString(part.value)});`);

                    return;
                }

                preamble.push(
                    `form.append(${jsString(part.name)}, ${partIdentifier(part.name, index)}, ${jsString(part.filename)});`,
                );
            });

            headers = removeHeader(headers, "Content-Type");
            notes.push({ id: "multipartBoundary", kind: "adapted" });
            data = "form";
            break;
        }
        case "file":
            if (node) {
                needsFs = true;
                data = `readFileSync(${jsString(request.body.path)})`;
            }
            break;
    }

    /* ------------------------------------------------------------ config --- */

    // Resolved before anything is written: axios has a first-class `auth` for
    // basic credentials, and nothing at all for a bearer token, which is simply
    // a header. Deciding after the header object was written would mean editing
    // an entry already in the list.
    if (request.auth !== null && request.auth.scheme === "bearer") {
        headers = setHeader(headers, "Authorization", `Bearer ${request.auth.token}`);
    }

    config.push(["method", jsString(request.method.toLowerCase())] as const);
    config.push(["url", jsString(request.url)] as const);

    if (headers.length > 0) {
        config.push(["headers", writer.headers(headers, 1)] as const);
    }

    if (data !== null) {
        config.push(["data", data] as const);
    }

    if (request.auth !== null && request.auth.scheme === "basic") {
        config.push([
            "auth",
            writer.object(
                [
                    ["username", jsString(request.auth.user)] as const,
                    ["password", jsString(request.auth.password)] as const,
                ],
                1,
            ),
        ] as const);
    }

    if (request.transfer.maxTimeSeconds !== null) {
        config.push([
            "timeout",
            String(Math.round(request.transfer.maxTimeSeconds * 1000)),
        ] as const);
    }

    // axios follows redirects by default; curl only does with `-L`. On Node that
    // is `maxRedirects: 0`. In a browser axios is XHR underneath, which follows
    // redirects itself and offers no way to refuse — so there the difference is
    // reported rather than written.
    if (!request.transfer.followRedirects && !node) {
        notes.push({ id: "redirectFollows", kind: "dropped" });
    }

    if (node) {
        if (!request.transfer.followRedirects) {
            config.push(["maxRedirects", "0"] as const);
        } else if (request.transfer.maxRedirects !== null) {
            config.push(["maxRedirects", String(request.transfer.maxRedirects)] as const);
        }

        if (request.transfer.proxy !== null) {
            const proxy = parseProxy(request.transfer.proxy);

            if (proxy === null) {
                notes.push({ id: "proxy", kind: "dropped", detail: request.transfer.proxy });
            } else {
                const entries: (readonly [string, string])[] = [
                    ["protocol", jsString(proxy.protocol)] as const,
                    ["host", jsString(proxy.host)] as const,
                ];

                if (proxy.port !== null) {
                    entries.push(["port", String(proxy.port)] as const);
                }

                if (proxy.username.length > 0) {
                    entries.push([
                        "auth",
                        writer.object(
                            [
                                ["username", jsString(proxy.username)] as const,
                                ["password", jsString(proxy.password)] as const,
                            ],
                            2,
                        ),
                    ] as const);
                }

                config.push(["proxy", writer.object(entries, 1)] as const);
            }
        }

        if (request.transfer.unixSocket !== null) {
            config.push(["socketPath", jsString(request.transfer.unixSocket)] as const);
        }

        if (request.transfer.insecure) {
            agentOptions.push(["rejectUnauthorized", "false"] as const);
            notes.push({ id: "insecureViaDispatcher", kind: "adapted" });
        }

        if (request.transfer.clientCert !== null) {
            needsFs = true;
            agentOptions.push([
                "cert",
                `readFileSync(${jsString(request.transfer.clientCert)})`,
            ] as const);
        }

        if (request.transfer.clientKey !== null) {
            needsFs = true;
            agentOptions.push([
                "key",
                `readFileSync(${jsString(request.transfer.clientKey)})`,
            ] as const);
        }

        if (request.transfer.caCert !== null) {
            needsFs = true;
            agentOptions.push([
                "ca",
                `readFileSync(${jsString(request.transfer.caCert)})`,
            ] as const);
        }

        if (agentOptions.length > 0) {
            imports.push('import https from "node:https";');
            config.push([
                "httpsAgent",
                `new https.Agent(${writer.object(agentOptions, 1)})`,
            ] as const);
        }
    }

    if (needsFs) {
        imports.push('import { readFileSync } from "node:fs";');
    }

    /* ------------------------------------------------------------- write --- */

    const call = `axios(${writer.object(config, 0)})`;
    const lines: string[] = [...imports, ""];

    if (preamble.length > 0) {
        lines.push(...preamble, "");
    }

    if (options.style === "promiseChain") {
        if (!options.includeResponse) {
            lines.push(`${call};`);
        } else {
            const one = writer.indent(1);
            const two = writer.indent(2);

            lines.push(
                call,
                `${one}.then((response) => {`,
                `${two}console.log(response.data);`,
                `${one}})`,
                `${one}.catch((error) => {`,
                `${two}console.error(error.response?.status, error.message);`,
                `${one}});`,
            );
        }
    } else {
        lines.push(`const response = await ${call};`);

        if (options.includeResponse) {
            // axios throws on a non-2xx, so there is no status branch to write —
            // the body is simply already parsed by the time this line runs.
            lines.push("", "const data = response.data;");
        }
    }

    return { output: lines.join("\n"), notes };
}
