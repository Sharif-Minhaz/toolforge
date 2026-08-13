import { z } from "zod";

import { DEFAULT_URL_OPTIONS } from "@/modules/url/domain/constants";
import { convert } from "@/modules/url/domain/convert";
import {
    urlCharsetSchema,
    urlEncodeProfileSchema,
    urlModeSchema,
    urlNewlineSeparatorSchema,
} from "@/modules/url/validation/conversion-options";
import { parseUrl } from "@/modules/url-parser/domain/parse";

import { MAX_MCP_TEXT_LENGTH } from "../domain/constants";
import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * The two URL tools, which are one import away from each other and answer
 * questions that arrive together: "escape this" and "what is in this".
 */

export const urlConvertTool = defineMcpTool({
    toolId: "url",
    verb: "convert",
    title: "Percent-encode or decode a URL",
    description:
        "Percent-encode text for a URL, or decode it back. `component` escapes everything a query value must not contain (the `encodeURIComponent` rule); `uri` preserves the characters that make a URL a URL; `form` is `application/x-www-form-urlencoded`, where a space becomes `+`. Decoding can unwrap repeatedly for double-encoded input.",
    kind: "offline",
    inputSchema: z.object({
        mode: urlModeSchema.default("encode"),
        text: z.string().max(MAX_MCP_TEXT_LENGTH),
        profile: urlEncodeProfileSchema
            .default(DEFAULT_URL_OPTIONS.profile)
            .describe("Which characters escape encoding. Ignored when decoding"),
        uppercaseHex: z
            .boolean()
            .default(DEFAULT_URL_OPTIONS.uppercaseHex)
            .describe("`%2F` rather than `%2f`, as RFC 3986 recommends"),
        charset: urlCharsetSchema.default(DEFAULT_URL_OPTIONS.charset),
        newline: urlNewlineSeparatorSchema.default(DEFAULT_URL_OPTIONS.newline),
        perLine: z.boolean().default(DEFAULT_URL_OPTIONS.perLine),
        wrapLines: z.boolean().default(DEFAULT_URL_OPTIONS.wrapLines),
        plusAsSpace: z
            .boolean()
            .default(DEFAULT_URL_OPTIONS.plusAsSpace)
            .describe("Read `+` as a space when decoding form data"),
        recursive: z
            .boolean()
            .default(DEFAULT_URL_OPTIONS.recursive)
            .describe("Keep decoding while the text still unwraps"),
    }),
    run: ({ mode, text, ...options }) => {
        const result = convert({ mode, source: { kind: "text", text }, options });

        if (!result.ok) {
            return refuseWithReason("URL encoder", result.reason, {
                position: result.position ?? null,
                line: result.line ?? null,
            });
        }

        return succeed(`${mode === "encode" ? "Encoded" : "Decoded"} ${result.inputBytes} bytes`, {
            output: result.output,
            mode,
            inputBytes: result.inputBytes,
            outputBytes: result.outputBytes,
            // Only interesting when decoding recursively, and misleading to
            // omit there — a payload that took three rounds was triple-encoded.
            passes: result.passes,
        });
    },
});

export const urlParseTool = defineMcpTool({
    toolId: "url-parser",
    verb: "parse",
    title: "Break a URL into its parts",
    description:
        "Split a URL into protocol, credentials, host, port, path, query and fragment using the WHATWG parser — the same one browsers use, so the answer matches what `fetch` would actually request. Query parameters come back as an ordered list that keeps duplicate keys, because a URL may legitimately repeat one.",
    kind: "offline",
    inputSchema: z.object({
        url: z.string().max(MAX_MCP_TEXT_LENGTH).describe("The URL to take apart"),
    }),
    run: ({ url }) => {
        const parsed = parseUrl(url);

        if (!parsed.ok) {
            // `missing_scheme` carries the text that would have parsed. Passing
            // it on is the difference between a model retrying blind and
            // retrying correctly.
            return refuseWithReason("URL parser", parsed.reason, {
                suggestion: parsed.suggestion ?? null,
            });
        }

        return succeed(`Parsed ${parsed.parts.hostname || "URL"}`, {
            href: parsed.href,
            parts: { ...parsed.parts },
            params: parsed.params.map((param) => ({ key: param.key, value: param.value })),
            normalized: parsed.normalized,
        });
    },
});
