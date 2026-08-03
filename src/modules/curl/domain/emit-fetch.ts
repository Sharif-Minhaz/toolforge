import { bytesToBase64 } from "@/modules/tools/domain/base64";
import type { CodeOptions, ConversionNote, HttpHeader, HttpRequest } from "../types";
import { CodeWriter, expectsJson, jsString } from "./code-writer";
import { formatCookieHeader, headerValue, removeHeader, setHeader } from "./headers";
import { transferNotes } from "./notes";

export type EmitCodeResult = {
    readonly output: string;
    readonly notes: readonly ConversionNote[];
};

const IDENTIFIER_SAFE = /[^A-Za-z0-9_$]/g;

export function basicAuthorization(user: string, password: string): string {
    return `Basic ${bytesToBase64(new TextEncoder().encode(`${user}:${password}`))}`;
}

/** A readable variable name for a file part the reader has to supply. */
export function partIdentifier(name: string, index: number): string {
    const cleaned = name.replace(IDENTIFIER_SAFE, "");

    return /^[A-Za-z_$]/.test(cleaned) ? `${cleaned}File` : `file${index + 1}`;
}

/** Folds `-u` and `--oauth2-bearer` into the header they actually send. */
export function withAuthorizationHeader(request: HttpRequest): readonly HttpHeader[] {
    const auth = request.auth;

    if (auth === null) {
        return request.headers;
    }

    if (auth.scheme === "bearer") {
        return setHeader(request.headers, "Authorization", `Bearer ${auth.token}`);
    }

    // Digest, NTLM and Negotiate are challenge–response: there is no header to
    // precompute, which is why they leave as a note instead.
    return auth.scheme === "basic"
        ? setHeader(request.headers, "Authorization", basicAuthorization(auth.user, auth.password))
        : request.headers;
}

/**
 * Writes the request as a `fetch` call.
 *
 * Two defaults differ between the two sides and both matter. `fetch` follows
 * redirects unless told not to, so silence here means `-L`; and a browser
 * refuses to set `Cookie`, so cookies become `credentials: "include"` and a
 * note rather than a header that would be dropped on the floor.
 */
export function emitFetch(request: HttpRequest, options: CodeOptions): EmitCodeResult {
    const writer = new CodeWriter(options.indent);
    const node = options.runtime === "node";
    const notes: ConversionNote[] = [
        ...transferNotes(request, {
            insecure: node,
            proxy: node,
            maxRedirects: false,
            connectTimeout: false,
            clientCert: false,
            caCert: false,
            unixSocket: false,
            retry: false,
            cookieHeader: node,
            bodyFromFile: node,
            httpVersion: false,
        }),
    ];

    const imports = new Map<string, Set<string>>();
    const preamble: string[] = [];
    const init: (readonly [string, string])[] = [];
    let headers = withAuthorizationHeader(request);

    function addImport(module: string, name: string): void {
        const existing = imports.get(module) ?? new Set<string>();

        existing.add(name);
        imports.set(module, existing);
    }

    /* ----------------------------------------------------------- cookies --- */

    if (request.cookies.length > 0 && node) {
        headers = setHeader(headers, "Cookie", formatCookieHeader(request.cookies));
    }

    /* ---------------------------------------------------------- referrer --- */

    const referer = headerValue(headers, "Referer");

    if (referer !== null && !node) {
        // Another forbidden header. `referrer` is the option that survives the
        // browser's own policy, so that is where it goes.
        headers = removeHeader(headers, "Referer");
        notes.push({ id: "refererAsOption", kind: "adapted" });
    }

    /* -------------------------------------------------------------- body --- */

    let body: string | null = null;

    switch (request.body.kind) {
        case "none":
            break;
        case "raw":
            body = jsString(request.body.text);
            break;
        case "json": {
            const literal = writer.jsonLiteral(request.body.text, 1);

            body = literal === null ? jsString(request.body.text) : `JSON.stringify(${literal})`;
            break;
        }
        case "urlencoded":
            body = `new URLSearchParams(${writer.pairs(request.body.fields, 1)})`;
            break;
        case "multipart": {
            preamble.push("const form = new FormData();");

            request.body.parts.forEach((part, index) => {
                if (part.filename === null) {
                    preamble.push(`form.append(${jsString(part.name)}, ${jsString(part.value)});`);

                    return;
                }

                const variable = partIdentifier(part.name, index);

                preamble.push(
                    `form.append(${jsString(part.name)}, ${variable}, ${jsString(part.filename)});`,
                );
            });

            // The browser writes the boundary into the header itself, and one
            // written by hand names a boundary the body does not contain.
            headers = removeHeader(headers, "Content-Type");
            notes.push({ id: "multipartBoundary", kind: "adapted" });
            body = "form";
            break;
        }
        case "file":
            if (node) {
                addImport("node:fs/promises", "readFile");
                body = `await readFile(${jsString(request.body.path)})`;
            }
            break;
    }

    /* -------------------------------------------------------------- init --- */

    if (request.method !== "GET") {
        init.push(["method", jsString(request.method)] as const);
    }

    if (headers.length > 0) {
        const written =
            options.headersStyle === "headersInstance"
                ? `new Headers(${writer.headers(headers, 1)})`
                : writer.headers(headers, 1);

        init.push(["headers", written] as const);
    }

    if (body !== null) {
        init.push(["body", body] as const);
    }

    const credentials =
        request.transfer.credentials ?? (request.cookies.length > 0 && !node ? "include" : null);

    if (credentials !== null) {
        init.push(["credentials", jsString(credentials)] as const);
    }

    if (referer !== null && !node) {
        init.push(["referrer", jsString(referer)] as const);
    }

    if (!request.transfer.followRedirects) {
        // curl only follows with `-L`, so silence in the command means "do not
        // follow" — while silence in a `fetch` init means the opposite. On Node
        // that is simply `redirect: "manual"`. In a browser the same line makes
        // the response *opaque*: status 0, headers gone, body unreadable. A
        // snippet that cannot read its own reply is a worse answer than one
        // that follows a redirect, so there it is left out and said instead.
        if (node) {
            init.push(["redirect", '"manual"'] as const);
            notes.push({ id: "redirectManual", kind: "adapted" });
        } else {
            notes.push({ id: "redirectFollows", kind: "dropped" });
        }
    }

    if (request.transfer.maxTimeSeconds !== null) {
        init.push([
            "signal",
            `AbortSignal.timeout(${Math.round(request.transfer.maxTimeSeconds * 1000)})`,
        ] as const);
        notes.push({ id: "timeoutAsSignal", kind: "adapted" });
    }

    if (request.transfer.mode !== null) {
        init.push(["mode", jsString(request.transfer.mode)] as const);
    }

    if (request.transfer.cache !== null) {
        init.push(["cache", jsString(request.transfer.cache)] as const);
    }

    if (request.transfer.integrity !== null) {
        init.push(["integrity", jsString(request.transfer.integrity)] as const);
    }

    if (request.transfer.keepalive) {
        init.push(["keepalive", "true"] as const);
    }

    /* -------------------------------------------------------- dispatcher --- */

    if (node && (request.transfer.insecure || request.transfer.proxy !== null)) {
        const insecure = request.transfer.insecure;
        const proxy = request.transfer.proxy;

        if (proxy !== null) {
            addImport("undici", "ProxyAgent");
            init.push([
                "dispatcher",
                insecure
                    ? `new ProxyAgent({ uri: ${jsString(proxy)}, requestTls: { rejectUnauthorized: false } })`
                    : `new ProxyAgent(${jsString(proxy)})`,
            ] as const);
            notes.push({ id: "proxyViaDispatcher", kind: "adapted" });
        } else {
            addImport("undici", "Agent");
            init.push([
                "dispatcher",
                "new Agent({ connect: { rejectUnauthorized: false } })",
            ] as const);
        }

        if (insecure) {
            notes.push({ id: "insecureViaDispatcher", kind: "adapted" });
        }
    }

    /* ------------------------------------------------------------- write --- */

    const url = jsString(request.url);
    const call = init.length === 0 ? `fetch(${url})` : `fetch(${url}, ${writer.object(init, 0)})`;
    const read = expectsJson(request.headers) ? "json" : "text";
    const lines: string[] = [];

    for (const [module, names] of imports) {
        lines.push(`import { ${[...names].join(", ")} } from ${jsString(module)};`);
    }

    if (lines.length > 0) {
        lines.push("");
    }

    if (preamble.length > 0) {
        lines.push(...preamble, "");
    }

    if (options.style === "promiseChain") {
        if (!options.includeResponse) {
            lines.push(`${call};`);
        } else {
            const one = writer.indent(1);
            const two = writer.indent(2);
            const three = writer.indent(3);

            lines.push(
                call,
                `${one}.then((response) => {`,
                `${two}if (!response.ok) {`,
                `${three}throw new Error(\`Request failed with status \${response.status}\`);`,
                `${two}}`,
                "",
                `${two}return response.${read}();`,
                `${one}})`,
                `${one}.then((data) => {`,
                `${two}console.log(data);`,
                `${one}})`,
                `${one}.catch((error) => {`,
                `${two}console.error(error);`,
                `${one}});`,
            );
        }
    } else {
        lines.push(`const response = await ${call};`);

        if (options.includeResponse) {
            const one = writer.indent(1);

            lines.push(
                "",
                "if (!response.ok) {",
                `${one}throw new Error(\`Request failed with status \${response.status}\`);`,
                "}",
                "",
                `const data = await response.${read}();`,
            );
        }
    }

    return { output: lines.join("\n"), notes };
}
