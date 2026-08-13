import { z } from "zod";

import { DEFAULT_CONVERSION_OPTIONS } from "@/modules/base64/domain/constants";
import { convert } from "@/modules/base64/domain/convert";
import {
    base64AlphabetSchema,
    base64ModeSchema,
    charsetSchema,
    newlineSeparatorSchema,
} from "@/modules/base64/validation/conversion-options";

import { MAX_MCP_TEXT_LENGTH } from "../domain/constants";
import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * Base64 in both directions, over text only.
 *
 * The page also accepts a file; this does not, and the omission is deliberate
 * rather than pending. A file arrives at an MCP tool as base64 inside the
 * argument, so "decode this file" would mean base64-encoding it to ask for it
 * to be decoded. The caller already holds the bytes it would have to send.
 */
export const base64ConvertTool = defineMcpTool({
    toolId: "base64",
    verb: "convert",
    title: "Encode or decode Base64",
    description:
        "Encode text to Base64 or decode Base64 back to text. Handles the URL-safe alphabet, unpadded input, `data:` URIs, MIME line wrapping, and non-UTF-8 character sets. Decoding reports the exact position of the first invalid character rather than guessing.",
    kind: "offline",
    inputSchema: z.object({
        mode: base64ModeSchema.default("encode"),
        text: z
            .string()
            .max(MAX_MCP_TEXT_LENGTH)
            .describe("Plain text when encoding, Base64 when decoding"),
        alphabet: base64AlphabetSchema
            .default(DEFAULT_CONVERSION_OPTIONS.alphabet)
            .describe("`urlSafe` swaps `+/` for `-_`"),
        padded: z.boolean().default(DEFAULT_CONVERSION_OPTIONS.padded).describe("Emit `=` padding"),
        dataUri: z
            .boolean()
            .default(DEFAULT_CONVERSION_OPTIONS.dataUri)
            .describe("Prefix encoded output with a `data:` header"),
        charset: charsetSchema
            .default(DEFAULT_CONVERSION_OPTIONS.charset)
            .describe("Source set when encoding, destination set when decoding"),
        newline: newlineSeparatorSchema.default(DEFAULT_CONVERSION_OPTIONS.newline),
        perLine: z
            .boolean()
            .default(DEFAULT_CONVERSION_OPTIONS.perLine)
            .describe("Convert each input line on its own"),
        wrapLines: z
            .boolean()
            .default(DEFAULT_CONVERSION_OPTIONS.wrapLines)
            .describe("Wrap encoded output at 76 characters, as MIME requires"),
    }),
    run: ({ mode, text, ...options }) => {
        const result = convert({ mode, source: { kind: "text", text }, options });

        if (!result.ok) {
            return refuseWithReason("Base64", result.reason, {
                position: result.position ?? null,
                line: result.line ?? null,
            });
        }

        return succeed(`${mode === "encode" ? "Encoded" : "Decoded"} ${result.inputBytes} bytes`, {
            output: result.output,
            mode,
            inputBytes: result.inputBytes,
            outputBytes: result.outputBytes,
        });
    },
});
