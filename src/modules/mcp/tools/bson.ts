import { z } from "zod";

import { DEFAULT_CONVERSION_OPTIONS } from "@/modules/bson/domain/constants";
import { convert } from "@/modules/bson/domain/convert";
import { DATA_FORMATS } from "@/modules/bson/types";
import { MAX_MCP_TEXT_LENGTH } from "../domain/constants";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * JSON, BSON and TOON, in any direction.
 *
 * The TOON leg is the one worth naming in the description: it exists to make a
 * document cheaper to put in a prompt, which is exactly what the caller of this
 * tool is doing. A model that can convert its own context to TOON before
 * embedding it is using the tool for the thing it was built for.
 */
export const bsonConvertTool = defineMcpTool({
    toolId: "bson",
    verb: "convert",
    title: "Convert between JSON, BSON and TOON",
    description:
        "Convert a document between JSON, BSON (as hex or base64, in canonical or relaxed Extended JSON) and TOON — a compact notation that costs fewer tokens than JSON for the same data. Reports anything the conversion could not carry across unchanged rather than dropping it silently.",
    kind: "offline",
    inputSchema: z.object({
        source: z.enum(DATA_FORMATS).default("json").describe("What `input` is written in"),
        target: z.enum(DATA_FORMATS).default("toon").describe("What to convert it to"),
        input: z.string().max(MAX_MCP_TEXT_LENGTH).describe("The document"),
        bsonEncoding: z
            .enum(["hex", "base64"])
            .default(DEFAULT_CONVERSION_OPTIONS.bsonEncoding)
            .describe("How BSON bytes are written as text"),
        ejsonMode: z
            .enum(["canonical", "relaxed"])
            .default(DEFAULT_CONVERSION_OPTIONS.ejsonMode)
            .describe("`canonical` round-trips types exactly; `relaxed` reads more naturally"),
        jsonIndent: z
            .enum(["minified", "two", "four", "tab"])
            .default(DEFAULT_CONVERSION_OPTIONS.jsonIndent),
        toonDelimiter: z
            .enum(["comma", "tab", "pipe"])
            .default(DEFAULT_CONVERSION_OPTIONS.toonDelimiter),
        toonIndent: z.enum(["two", "four"]).default(DEFAULT_CONVERSION_OPTIONS.toonIndent),
        toonStrict: z
            .boolean()
            .default(DEFAULT_CONVERSION_OPTIONS.toonStrict)
            .describe("Require a TOON array header to agree with the rows under it"),
    }),
    run: ({ source, target, input, ...options }) => {
        const result = convert({ source, target, input, options });

        if (!result.ok) {
            return refuseWithReason("Converter", result.reason, {
                line: result.line ?? null,
                declaredBytes: result.declaredBytes ?? null,
                actualBytes: result.actualBytes ?? null,
            });
        }

        return succeed(
            `${source} → ${target}: ${result.inputLength} → ${result.outputLength} characters`,
            {
                output: result.output,
                inputLength: result.inputLength,
                outputLength: result.outputLength,
                notes: result.notes.map((note) => ({ id: note.id, kind: note.kind })),
            },
        );
    },
});
