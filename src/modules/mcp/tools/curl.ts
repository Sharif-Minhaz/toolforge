import { z } from "zod";

import { DEFAULT_CODE_OPTIONS, DEFAULT_CURL_OPTIONS } from "@/modules/curl/domain/constants";
import { emitAxios } from "@/modules/curl/domain/emit-axios";
import { emitCurl } from "@/modules/curl/domain/emit-curl";
import { emitFetch } from "@/modules/curl/domain/emit-fetch";
import { emitNodeHttp } from "@/modules/curl/domain/emit-node-http";
import { parseCurl } from "@/modules/curl/domain/parse-curl";
import { parseFetch } from "@/modules/curl/domain/parse-fetch";
import type { CodeOptions, ConversionNote, HttpRequest } from "@/modules/curl/types";
import {
    codeStyleSchema,
    codeTargetSchema,
    curlDirectionSchema,
    curlInputSchema,
    fetchRuntimeSchema,
    headersStyleSchema,
    indentWidthSchema,
    shellDialectSchema,
} from "@/modules/curl/validation/curl-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * A `curl` command turned into code, or code turned back into `curl`.
 *
 * Nothing here makes the request. The tool reads one representation and writes
 * another, which is why it counts as `offline` despite being entirely about
 * HTTP — the caller runs what comes back, on their own machine, having read it.
 *
 * The notes matter more here than in most adapters. `--insecure` has no `fetch`
 * equivalent and `--compressed` is implicit in a browser; a conversion that
 * quietly dropped either would hand somebody a command that behaves differently
 * from the one they pasted.
 */

function emitCode(request: HttpRequest, options: CodeOptions) {
    if (options.target === "axios") {
        return emitAxios(request, options);
    }

    return options.target === "nodeHttp"
        ? emitNodeHttp(request, options)
        : emitFetch(request, options);
}

function describeNotes(notes: readonly ConversionNote[]) {
    return notes.map((note) => ({ id: note.id, kind: note.kind, detail: note.detail ?? null }));
}

export const curlConvertTool = defineMcpTool({
    toolId: "curl",
    verb: "convert",
    title: "Convert between curl and code",
    description:
        "Convert a `curl` command into JavaScript (`fetch`, `axios` or Node's `http` module), or convert a `fetch`/`axios` call back into a `curl` command for POSIX shells, `cmd` or PowerShell. Understands headers, cookies, basic auth, form and multipart bodies, and query strings. Reports every option that could not survive the conversion — `--insecure` has no `fetch` equivalent, and a silent drop would change what the request does.",
    kind: "offline",
    inputSchema: z.object({
        direction: curlDirectionSchema
            .default("curlToCode")
            .describe("`curlToCode` reads a curl command; `codeToCurl` reads JavaScript"),
        input: curlInputSchema.describe("The command or the code, exactly as written"),
        target: codeTargetSchema
            .default(DEFAULT_CODE_OPTIONS.target)
            .describe("Which client to write. Ignored when converting to curl"),
        runtime: fetchRuntimeSchema
            .default(DEFAULT_CODE_OPTIONS.runtime)
            .describe("`node` adds the imports a browser does not need"),
        style: codeStyleSchema.default(DEFAULT_CODE_OPTIONS.style),
        headersStyle: headersStyleSchema.default(DEFAULT_CODE_OPTIONS.headersStyle),
        includeResponse: z
            .boolean()
            .default(DEFAULT_CODE_OPTIONS.includeResponse)
            .describe("Emit the lines that read the response body"),
        indent: indentWidthSchema.default(DEFAULT_CODE_OPTIONS.indent),
        shell: shellDialectSchema
            .default(DEFAULT_CURL_OPTIONS.shell)
            .describe("Quoting rules for the emitted curl command"),
        longFlags: z
            .boolean()
            .default(DEFAULT_CURL_OPTIONS.longFlags)
            .describe("`--header` rather than `-H`"),
        multiLine: z.boolean().default(DEFAULT_CURL_OPTIONS.multiLine),
        explicitMethod: z
            .boolean()
            .default(DEFAULT_CURL_OPTIONS.explicitMethod)
            .describe("Write `-X POST` even where curl would infer it"),
    }),
    run: ({
        direction,
        input,
        target,
        runtime,
        style,
        headersStyle,
        includeResponse,
        indent,
        ...curl
    }) => {
        if (direction === "codeToCurl") {
            const parsed = parseFetch(input);

            if (!parsed.ok) {
                return refuseWithReason("curl converter", parsed.reason, {
                    token: parsed.token ?? null,
                });
            }

            const emitted = emitCurl(parsed.request, curl);

            return succeed(`Converted to a ${curl.shell} curl command`, {
                output: emitted.output,
                method: parsed.request.method,
                url: parsed.request.url,
                notes: [...describeNotes(parsed.notes), ...describeNotes(emitted.notes)],
            });
        }

        const parsed = parseCurl(input);

        if (!parsed.ok) {
            return refuseWithReason("curl parser", parsed.reason, { token: parsed.token ?? null });
        }

        const emitted = emitCode(parsed.request, {
            target,
            runtime,
            style,
            headersStyle,
            includeResponse,
            indent,
        });

        return succeed(`Converted to ${target}`, {
            output: emitted.output,
            method: parsed.request.method,
            url: parsed.request.url,
            readAsShell: parsed.shell,
            notes: [...describeNotes(parsed.notes), ...describeNotes(emitted.notes)],
        });
    },
});
