import type { DownloadFile } from "@/modules/tools/types";
import type { CodeTarget, CurlDirection, CurlExportRequest, HttpRequest } from "../types";
import { MIME_TYPE } from "./constants";

/** File stems, not copy: these end up on disk and stay English either way. */
const STEMS: Record<CodeTarget | "curl", string> = {
    curl: "request-curl",
    fetch: "request-fetch",
    axios: "request-axios",
    nodeHttp: "request-node-https",
};

function extensionFor(direction: CurlDirection): string {
    return direction === "codeToCurl" ? "sh" : "js";
}

/** `request-fetch-20260803T101500Z.js` — sortable and self-describing. */
export function buildCurlExportFilename(
    direction: CurlDirection,
    target: CodeTarget,
    generatedAt: Date,
): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    const stem = direction === "codeToCurl" ? STEMS.curl : STEMS[target];

    return `${stem}-${stamp}.${extensionFor(direction)}`;
}

/**
 * The parsed request as JSON, in the order the Request tab lists it rather than
 * the order the object happens to enumerate. This is the model both directions
 * are built from, so it is worth being able to take away on its own.
 */
export function buildRequestJson(request: HttpRequest): string {
    return JSON.stringify(
        {
            method: request.method,
            url: request.url,
            query: request.query,
            headers: request.headers,
            cookies: request.cookies,
            auth: request.auth,
            body: request.body,
            transfer: request.transfer,
        },
        null,
        2,
    );
}

export function createCurlExportFile(request: CurlExportRequest): DownloadFile {
    const shell = request.direction === "codeToCurl";

    return {
        filename: buildCurlExportFilename(request.direction, request.target, request.generatedAt),
        mimeType: shell ? MIME_TYPE.curl : MIME_TYPE[request.target],
        // A shell script that is going to be executed needs its interpreter
        // line; a snippet meant to be pasted into an editor does not.
        content: shell ? `#!/bin/sh\n${request.content}\n` : `${request.content}\n`,
    };
}
