import { z } from "zod";

import { DEFAULT_FORMAT_OPTIONS, MAX_JSON_INPUT_BYTES } from "@/modules/json/domain/constants";
import { describeSizeDelta, formatJson } from "@/modules/json/domain/format";
import {
    jsonIndentSchema,
    jsonModeSchema,
    jsonSpecSchema,
} from "@/modules/json/validation/format-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuse, succeed } from "../domain/result";

/**
 * Beautify, minify, or validate — and the failure is the interesting half.
 *
 * `JSON.parse` says "Unexpected token } in JSON at position 41", which is a
 * character offset a model then has to count to. This parser reports a line, a
 * column, what it found and what the grammar wanted, and names the code that
 * repair mode would have absorbed. All of it is passed through, because a
 * caller that can be told exactly what is wrong can fix it in one more turn.
 */
export const jsonFormatTool = defineMcpTool({
    toolId: "json",
    verb: "format",
    title: "Format, minify or validate JSON",
    description:
        "Pretty-print, minify, or validate a JSON document. Reports errors by line and column with the offending token, flags duplicate keys, unpaired surrogates and numbers that lose precision in a double, and can repair the usual non-standard extras — trailing commas, comments, single quotes — instead of refusing them. Counts objects, arrays, keys and nesting depth.",
    kind: "offline",
    inputSchema: z.object({
        mode: jsonModeSchema
            .default("beautify")
            .describe("`validate` reports without rewriting the document"),
        input: z.string().max(MAX_JSON_INPUT_BYTES).describe("The JSON document"),
        indent: jsonIndentSchema.default(DEFAULT_FORMAT_OPTIONS.indent),
        spec: jsonSpecSchema
            .default(DEFAULT_FORMAT_OPTIONS.spec)
            .describe("Which JSON specification to hold the document to"),
        repair: z
            .boolean()
            .default(DEFAULT_FORMAT_OPTIONS.repair)
            .describe("Accept and correct trailing commas, comments and single quotes"),
        sortKeys: z.boolean().default(DEFAULT_FORMAT_OPTIONS.sortKeys),
        escapeUnicode: z
            .boolean()
            .default(DEFAULT_FORMAT_OPTIONS.escapeUnicode)
            .describe("Rewrite every non-ASCII character as `\\uXXXX`"),
    }),
    run: ({ mode, input, ...options }) => {
        const result = formatJson({ mode, input, options });

        if (!result.ok) {
            const { code, line, column, offset, found, expected } = result.error;

            return refuse(
                code,
                `Invalid JSON at line ${line}, column ${column}: ${code.replaceAll("_", " ")}.`,
                {
                    reason: code,
                    line,
                    column,
                    offset,
                    found: found ?? null,
                    expected: expected ?? null,
                    inputBytes: result.inputBytes,
                },
            );
        }

        const delta = describeSizeDelta(result.inputBytes, result.outputBytes);

        return succeed(
            mode === "validate"
                ? `Valid JSON — ${result.stats.keys} keys, depth ${result.stats.depth}`
                : `${result.outputBytes} bytes, ${delta.percent}% ${delta.direction}`,
            {
                output: result.output,
                stats: { ...result.stats },
                inputBytes: result.inputBytes,
                outputBytes: result.outputBytes,
                sizeDelta: { ...delta },
                advisories: result.advisories.map((advisory) => ({
                    code: advisory.code,
                    line: advisory.line,
                    column: advisory.column,
                    key: advisory.key ?? null,
                    literal: advisory.literal ?? null,
                })),
                repairs: result.repairs.map((repair) => ({
                    code: repair.code,
                    line: repair.line,
                    column: repair.column,
                })),
            },
        );
    },
});
