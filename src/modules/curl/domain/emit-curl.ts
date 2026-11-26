import { quoteArgument } from "@/modules/tools/domain/shell-quote";
import type { ShellDialect } from "@/modules/tools/domain/shell-tokenize";
import type { ConversionNote, CurlOptions, HttpRequest, MultipartPart } from "../types";
import { CURL_COMMAND, HTTP_VERSION_FLAGS, LINE_CONTINUATION } from "./constants";
import { formatCookieHeader } from "./headers";
import { formatUrlEncoded } from "./url";

/**
 * What a dialect cannot carry inside one argument. Both are real: cmd has no
 * way to put a newline in an argument on an interactive line, and `%name%` is
 * expanded by the shell before curl ever sees it.
 */
function unquotableReason(value: string, dialect: ShellDialect): ConversionNote["id"] | null {
    if (dialect !== "cmd") {
        return null;
    }

    if (/[\r\n]/.test(value)) {
        return "shellCannotQuoteNewline";
    }

    return /%[^%]+%/.test(value) ? "shellCannotQuotePercent" : null;
}

export type EmitCurlResult = {
    readonly output: string;
    readonly notes: readonly ConversionNote[];
};

/** Whether curl would already have used this method without being told. */
function methodIsImplied(request: HttpRequest): boolean {
    if (request.transfer.headOnly) {
        return request.method === "HEAD";
    }

    if (request.body.kind === "none") {
        return request.method === "GET";
    }

    return request.method === "POST";
}

function formPart(part: MultipartPart): { readonly flag: string; readonly value: string } {
    if (part.filename !== null) {
        const type = part.contentType === null ? "" : `;type=${part.contentType}`;
        const rename = part.filename === part.value ? "" : `;filename=${part.filename}`;

        return { flag: "form", value: `${part.name}=@${part.value}${type}${rename}` };
    }

    // A literal value that opens with `@` or `<` would be read as a file, and
    // `--form-string` is the only spelling that says "no, it really is text".
    if (part.value.startsWith("@") || part.value.startsWith("<")) {
        return { flag: "form-string", value: `${part.name}=${part.value}` };
    }

    const type = part.contentType === null ? "" : `;type=${part.contentType}`;

    return { flag: "form", value: `${part.name}=${part.value}${type}` };
}

/**
 * Writes the request back out as a command. The reverse of `parseCurl`, and
 * deliberately its own file: the two never share a table, so a mistake in one
 * cannot cancel itself out in the other and pass a round-trip test.
 */
export function emitCurl(request: HttpRequest, options: CurlOptions): EmitCurlResult {
    const notes: ConversionNote[] = [];
    const parts: string[] = [CURL_COMMAND[options.shell]];
    const unquotable = new Set<ConversionNote["id"]>();

    function quote(value: string): string {
        const reason = unquotableReason(value, options.shell);

        if (reason !== null) {
            unquotable.add(reason);
        }

        return quoteArgument(value, options.shell);
    }

    function flag(long: string, short?: string): string {
        return options.longFlags || short === undefined ? `--${long}` : `-${short}`;
    }

    function push(long: string, short: string | undefined, value?: string): void {
        parts.push(
            value === undefined ? flag(long, short) : `${flag(long, short)} ${quote(value)}`,
        );
    }

    parts.push(quote(request.url));

    if (request.transfer.headOnly) {
        push("head", "I");
    }

    if (options.explicitMethod || !methodIsImplied(request)) {
        push("request", "X", request.method);
    }

    /* ----------------------------------------------------------- headers --- */

    for (const header of request.headers) {
        // curl generates the multipart boundary itself, and a Content-Type
        // written by hand would name one that is not in the body.
        if (
            request.body.kind === "multipart" &&
            header.name.toLowerCase() === "content-type" &&
            header.value.toLowerCase().startsWith("multipart/form-data")
        ) {
            notes.push({ id: "multipartBoundary", kind: "adapted" });
            continue;
        }

        // `Name:` with nothing after it tells curl to *remove* a header it
        // would otherwise add, so an empty value has to leave as `Name;` — the
        // one spelling that means "send this, empty".
        push(
            "header",
            "H",
            header.value.length === 0 ? `${header.name};` : `${header.name}: ${header.value}`,
        );
    }

    if (request.cookies.length > 0) {
        push("cookie", "b", formatCookieHeader(request.cookies));
    }

    if (request.transfer.cookieFile !== null) {
        push("cookie", "b", request.transfer.cookieFile);
    }

    /* -------------------------------------------------------------- auth --- */

    if (request.auth !== null) {
        const auth = request.auth;

        if (auth.scheme === "bearer") {
            push("oauth2-bearer", undefined, auth.token);
        } else {
            push("user", "u", `${auth.user}:${auth.password}`);

            if (auth.scheme !== "basic") {
                push(auth.scheme, undefined);
            }
        }
    }

    /* -------------------------------------------------------------- body --- */

    switch (request.body.kind) {
        case "none":
            break;
        case "raw":
        case "json":
            // `--data-raw` rather than `-d`, always: a payload that happens to
            // open with `@` would otherwise be read as a filename.
            parts.push(`--data-raw ${quote(request.body.text)}`);
            break;
        case "urlencoded":
            parts.push(`--data-raw ${quote(formatUrlEncoded(request.body.fields))}`);
            break;
        case "multipart":
            for (const part of request.body.parts) {
                const written = formPart(part);

                push(written.flag, written.flag === "form" ? "F" : undefined, written.value);
            }
            break;
        case "file":
            parts.push(
                `${request.body.binary ? "--data-binary" : "--data"} ${quote(`@${request.body.path}`)}`,
            );
            break;
    }

    /* ---------------------------------------------------------- transfer --- */

    const transfer = request.transfer;

    if (transfer.followRedirects) {
        push("location", "L");
    }

    if (transfer.maxRedirects !== null) {
        push("max-redirs", undefined, String(transfer.maxRedirects));
    }

    if (transfer.compressed) {
        push("compressed", undefined);
    }

    if (transfer.insecure) {
        push("insecure", "k");
    }

    if (transfer.proxy !== null) {
        push("proxy", "x", transfer.proxy);
    }

    if (transfer.proxyUser !== null) {
        push("proxy-user", "U", transfer.proxyUser);
    }

    if (transfer.maxTimeSeconds !== null) {
        push("max-time", "m", String(transfer.maxTimeSeconds));
    }

    if (transfer.connectTimeoutSeconds !== null) {
        push("connect-timeout", undefined, String(transfer.connectTimeoutSeconds));
    }

    if (transfer.httpVersion !== "default") {
        push(HTTP_VERSION_FLAGS[transfer.httpVersion], undefined);
    }

    if (transfer.clientCert !== null) {
        push("cert", "E", transfer.clientCert);
    }

    if (transfer.clientKey !== null) {
        push("key", undefined, transfer.clientKey);
    }

    if (transfer.caCert !== null) {
        push("cacert", undefined, transfer.caCert);
    }

    if (transfer.unixSocket !== null) {
        push("unix-socket", undefined, transfer.unixSocket);
    }

    if (transfer.interfaceName !== null) {
        push("interface", undefined, transfer.interfaceName);
    }

    for (const entry of transfer.resolve) {
        push("resolve", undefined, entry);
    }

    if (transfer.retry !== null) {
        push("retry", undefined, String(transfer.retry));
    }

    if (transfer.netrc) {
        push("netrc", "n");
    }

    if (transfer.outputPath !== null) {
        if (transfer.outputPath.length === 0) {
            push("remote-name", "O");
        } else {
            push("output", "o", transfer.outputPath);
        }
    }

    if (transfer.includeHeaders) {
        push("include", "i");
    }

    if (transfer.silent) {
        push("silent", "s");
    }

    if (transfer.verbose) {
        push("verbose", "v");
    }

    if (transfer.failFast) {
        push("fail", "f");
    }

    /* ------------------------------------------------------------- notes --- */

    if (transfer.credentials !== null) {
        notes.push({ id: "credentialsIgnored", kind: "dropped", detail: transfer.credentials });
    }

    for (const [name, value] of [
        ["mode", transfer.mode],
        ["cache", transfer.cache],
        ["integrity", transfer.integrity],
    ] as const) {
        if (value !== null) {
            notes.push({ id: "fetchOnlyInit", kind: "dropped", detail: name });
        }
    }

    if (transfer.keepalive) {
        notes.push({ id: "fetchOnlyInit", kind: "dropped", detail: "keepalive" });
    }

    for (const reason of unquotable) {
        notes.push({ id: reason, kind: "dropped" });
    }

    const separator = options.multiLine ? LINE_CONTINUATION[options.shell] : " ";
    // The address stays on the `curl` line however long the command gets. It is
    // the one argument a reader scans for, and a command whose first line is
    // just `curl \` tells them nothing.
    const [command, url, ...rest] = parts;
    const head = `${command} ${url}`;

    return { output: rest.length === 0 ? head : [head, ...rest].join(separator), notes };
}
