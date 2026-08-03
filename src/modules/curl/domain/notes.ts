import type { ConversionNote, HttpRequest } from "../types";

/**
 * Every language this tool writes loses a different third of what curl can say,
 * and the losses are the part worth naming. A converter that silently drops
 * `-k`, `--max-redirs` and `--cert` hands back a snippet that looks right and
 * behaves differently the first time it meets a self-signed certificate.
 *
 * So each target declares what it can carry, and everything it cannot becomes a
 * note the reader can see. `dropped` means the request now behaves differently;
 * `adapted` means it survived as something that does not look like it.
 */
export type TargetCapability = {
    readonly insecure: boolean;
    readonly proxy: boolean;
    readonly maxRedirects: boolean;
    readonly connectTimeout: boolean;
    readonly clientCert: boolean;
    readonly caCert: boolean;
    readonly unixSocket: boolean;
    readonly retry: boolean;
    /** Whether a `Cookie` header may be set at all — browsers forbid it. */
    readonly cookieHeader: boolean;
    readonly bodyFromFile: boolean;
    readonly httpVersion: boolean;
};

/** Flags that only ever changed what curl printed, never what it sent. */
function transportOnlyFlags(request: HttpRequest): readonly string[] {
    const transfer = request.transfer;

    return [
        transfer.verbose ? "--verbose" : null,
        transfer.silent ? "--silent" : null,
        transfer.includeHeaders ? "--include" : null,
        transfer.failFast ? "--fail" : null,
    ].filter((flag): flag is string => flag !== null);
}

export function transferNotes(
    request: HttpRequest,
    supports: TargetCapability,
): readonly ConversionNote[] {
    const notes: ConversionNote[] = [];
    const transfer = request.transfer;

    const drop = (id: ConversionNote["id"], detail?: string) => {
        notes.push(
            detail === undefined ? { id, kind: "dropped" } : { id, kind: "dropped", detail },
        );
    };

    if (transfer.insecure && !supports.insecure) {
        drop("insecureTls");
    }

    if (transfer.proxy !== null && !supports.proxy) {
        drop("proxy", transfer.proxy);
    }

    if (transfer.maxRedirects !== null && !supports.maxRedirects) {
        drop("maxRedirects", String(transfer.maxRedirects));
    }

    if (transfer.connectTimeoutSeconds !== null && !supports.connectTimeout) {
        drop("connectTimeout", String(transfer.connectTimeoutSeconds));
    }

    if ((transfer.clientCert !== null || transfer.clientKey !== null) && !supports.clientCert) {
        drop("clientCert", transfer.clientCert ?? transfer.clientKey ?? "");
    }

    if (transfer.caCert !== null && !supports.caCert) {
        drop("caCert", transfer.caCert);
    }

    if (transfer.unixSocket !== null && !supports.unixSocket) {
        drop("unixSocket", transfer.unixSocket);
    }

    if (transfer.retry !== null && !supports.retry) {
        drop("retry", String(transfer.retry));
    }

    if (transfer.httpVersion !== "default" && !supports.httpVersion) {
        drop("httpVersion");
    }

    if (transfer.compressed) {
        notes.push({ id: "compressedAutomatic", kind: "adapted" });
    }

    if (transfer.cookieFile !== null) {
        drop("cookieFile", transfer.cookieFile);
    }

    // `Cookie` is on the forbidden-header list: a browser refuses to set it and
    // sends its own jar instead, so the value here simply never arrives.
    if (request.cookies.length > 0 && !supports.cookieHeader) {
        drop("cookieHeaderForbidden");
    }

    if (transfer.netrc) {
        drop("netrc");
    }

    if (transfer.interfaceName !== null) {
        drop("interfaceName", transfer.interfaceName);
    }

    for (const entry of transfer.resolve) {
        drop("resolveHost", entry);
    }

    if (transfer.outputPath !== null) {
        drop(
            "outputFile",
            transfer.outputPath.length === 0 ? "--remote-name" : transfer.outputPath,
        );
    }

    const transportOnly = transportOnlyFlags(request);

    if (transportOnly.length > 0) {
        drop("transportOnly", transportOnly.join(" "));
    }

    if (transfer.headOnly) {
        notes.push({ id: "headOnly", kind: "adapted" });
    }

    if (request.auth !== null) {
        if (request.auth.scheme === "digest" || request.auth.scheme === "ntlm") {
            drop("digestAuth", request.auth.scheme);
        } else if (request.auth.scheme === "negotiate") {
            drop("negotiateAuth");
        }
    }

    if (request.body.kind === "file" && !supports.bodyFromFile) {
        drop("bodyFromFile", request.body.path);
    }

    if (request.body.kind === "multipart" && request.body.parts.some((part) => part.filename)) {
        notes.push({ id: "multipartFile", kind: "adapted" });
    }

    return notes;
}
