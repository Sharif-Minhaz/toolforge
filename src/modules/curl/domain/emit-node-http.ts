import type { CodeOptions, ConversionNote, HttpRequest } from "../types";
import { CodeWriter, jsString } from "./code-writer";
import { basicAuthorization, type EmitCodeResult } from "./emit-fetch";
import { formatCookieHeader, setHeader } from "./headers";
import { formatUrlEncoded } from "./url";
import { transferNotes } from "./notes";

type Target = {
    readonly module: "node:https" | "node:http";
    readonly alias: "https" | "http";
    readonly hostname: string;
    readonly port: string;
    readonly path: string;
};

/**
 * `new URL()` is safe to call here — it is specified rather than host-derived,
 * so the server render and the hydration pass agree on what it returns.
 */
function splitTarget(url: string): Target | null {
    try {
        const parsed = new URL(url);
        const secure = parsed.protocol !== "http:";

        return {
            module: secure ? "node:https" : "node:http",
            alias: secure ? "https" : "http",
            hostname: parsed.hostname,
            port: parsed.port.length > 0 ? parsed.port : secure ? "443" : "80",
            path: `${parsed.pathname}${parsed.search}`,
        };
    } catch {
        return null;
    }
}

/**
 * Writes the request against Node's own HTTP client.
 *
 * The one people reach for when a dependency is out of the question, and the
 * one that behaves least like curl: `node:https` never follows a redirect, so
 * `-L` cannot be honoured at all rather than merely being spelled differently.
 * That is a note, not a silent omission.
 */
export function emitNodeHttp(request: HttpRequest, options: CodeOptions): EmitCodeResult {
    const writer = new CodeWriter(options.indent);
    const notes: ConversionNote[] = [
        ...transferNotes(request, {
            insecure: true,
            proxy: false,
            maxRedirects: false,
            connectTimeout: false,
            clientCert: true,
            caCert: true,
            unixSocket: true,
            retry: false,
            cookieHeader: true,
            bodyFromFile: true,
            httpVersion: false,
        }),
    ];

    const target = splitTarget(request.url);
    const imports: string[] = [];
    const preamble: string[] = [];
    const requestOptions: (readonly [string, string])[] = [];
    let headerEntries: (readonly [string, string])[] = [];
    let headers = request.headers;
    let needsFs = false;

    if (request.cookies.length > 0) {
        headers = setHeader(headers, "Cookie", formatCookieHeader(request.cookies));
    }

    if (request.auth !== null && request.auth.scheme === "basic") {
        headers = setHeader(
            headers,
            "Authorization",
            basicAuthorization(request.auth.user, request.auth.password),
        );
    }

    if (request.auth !== null && request.auth.scheme === "bearer") {
        headers = setHeader(headers, "Authorization", `Bearer ${request.auth.token}`);
    }

    headerEntries = headers.map((header) => [header.name, jsString(header.value)] as const);

    /* -------------------------------------------------------------- body --- */

    let payload: string | null = null;

    switch (request.body.kind) {
        case "none":
            break;
        case "raw":
        case "json":
            payload = jsString(request.body.text);
            break;
        case "urlencoded":
            payload = jsString(formatUrlEncoded(request.body.fields));
            break;
        case "multipart":
            // node:https has no multipart writer, and hand-rolling a boundary in
            // generated code would be a worse answer than saying so.
            notes.push({ id: "multipartUnsupported", kind: "dropped" });
            break;
        case "file":
            needsFs = true;
            payload = `readFileSync(${jsString(request.body.path)})`;
            break;
    }

    if (payload !== null) {
        preamble.push(`const payload = ${payload};`);
        headerEntries = [
            ...headerEntries,
            ["Content-Length", "Buffer.byteLength(payload)"] as const,
        ];
    }

    /* ----------------------------------------------------------- options --- */

    if (target === null) {
        requestOptions.push(["href", jsString(request.url)] as const);
    } else {
        requestOptions.push(["hostname", jsString(target.hostname)] as const);
        requestOptions.push(["port", target.port] as const);
        requestOptions.push(["path", jsString(target.path)] as const);
    }

    requestOptions.push(["method", jsString(request.method)] as const);

    if (headerEntries.length > 0) {
        requestOptions.push(["headers", writer.object(headerEntries, 1)] as const);
    }

    if (request.transfer.insecure) {
        requestOptions.push(["rejectUnauthorized", "false"] as const);
        notes.push({ id: "insecureViaDispatcher", kind: "adapted" });
    }

    if (request.transfer.unixSocket !== null) {
        requestOptions.push(["socketPath", jsString(request.transfer.unixSocket)] as const);
    }

    for (const [key, path] of [
        ["cert", request.transfer.clientCert],
        ["key", request.transfer.clientKey],
        ["ca", request.transfer.caCert],
    ] as const) {
        if (path !== null) {
            needsFs = true;
            requestOptions.push([key, `readFileSync(${jsString(path)})`] as const);
        }
    }

    if (request.transfer.maxTimeSeconds !== null) {
        requestOptions.push([
            "timeout",
            String(Math.round(request.transfer.maxTimeSeconds * 1000)),
        ] as const);
    }

    if (request.transfer.followRedirects) {
        notes.push({ id: "redirectsNotFollowed", kind: "dropped" });
    }

    /* ------------------------------------------------------------- write --- */

    const alias = target?.alias ?? "https";

    imports.push(`import ${alias} from ${jsString(target?.module ?? "node:https")};`);

    if (needsFs) {
        imports.push('import { readFileSync } from "node:fs";');
    }

    const one = writer.indent(1);
    const two = writer.indent(2);
    const lines: string[] = [...imports, ""];

    if (preamble.length > 0) {
        lines.push(...preamble, "");
    }

    lines.push(
        `const options = ${writer.object(requestOptions, 0)};`,
        "",
        `const request = ${alias}.request(options, (response) => {`,
        `${one}const chunks = [];`,
        "",
        `${one}response.on("data", (chunk) => chunks.push(chunk));`,
        `${one}response.on("end", () => {`,
        `${two}console.log(response.statusCode, Buffer.concat(chunks).toString("utf8"));`,
        `${one}});`,
        "});",
        "",
        'request.on("error", (error) => {',
        `${one}console.error(error);`,
        "});",
    );

    if (request.transfer.maxTimeSeconds !== null) {
        lines.push(
            "",
            'request.on("timeout", () => {',
            `${one}request.destroy(new Error("Request timed out"));`,
            "});",
        );
    }

    lines.push("");

    if (payload !== null) {
        lines.push("request.write(payload);");
    }

    lines.push("request.end();");

    return { output: lines.join("\n"), notes };
}
