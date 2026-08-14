import { z } from "zod";

import { DEFAULT_TEXT_CASE_OPTIONS, supportsAcronyms } from "@/modules/text-case/domain/constants";
import { convertCase } from "@/modules/text-case/domain/convert";
import {
    textCaseInputSchema,
    textCaseSchema,
} from "@/modules/text-case/validation/text-case-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const textCaseConvertTool = defineMcpTool({
    toolId: "text-case",
    verb: "convert",
    title: "Convert text case",
    description:
        "Rewrite text in one of fourteen cases. Seven keep it as prose and leave the punctuation alone — sentence, lower, upper, capitalized, title, alternating, inverse — and seven build an identifier out of the words instead: camel, pascal, snake, kebab, constant, dot, path. Use it to repair text typed with the caps lock on, to title-case a headline, or to turn a phrase into a variable, column or file name.",
    kind: "offline",
    inputSchema: z.object({
        text: textCaseInputSchema.describe("The text to convert, or one item per line"),
        textCase: textCaseSchema
            .default(DEFAULT_TEXT_CASE_OPTIONS.textCase)
            .describe("Which case to write the text in"),
        perLine: z
            .boolean()
            .default(DEFAULT_TEXT_CASE_OPTIONS.perLine)
            .describe(
                "Convert each line on its own, so a pasted list stays row for row and an identifier is built per line",
            ),
        preserveAcronyms: z
            .boolean()
            .default(DEFAULT_TEXT_CASE_OPTIONS.preserveAcronyms)
            .describe(
                "Leave a run of two or more capitals (API, HTTP, JSON) as typed. Honoured only by sentence, capitalized, title, camel and pascal; ignored by the other nine. Leave it off for text typed with the caps lock on, where every word is such a run",
            ),
    }),
    run: ({ text, ...options }) => {
        const result = convertCase(text, options);

        if (!result.ok) {
            return refuseWithReason("Text case converter", result.reason, {
                textCase: options.textCase,
            });
        }

        return succeed(result.text, {
            text: result.text,
            textCase: options.textCase,
            characters: result.stats.characters,
            words: result.stats.words,
            lines: result.stats.lines,
            unchanged: result.unchanged,
            // An MCP caller has no greyed-out switch to look at, so the one
            // argument that can be silently inert says so in the answer.
            acronymsApplied: options.preserveAcronyms && supportsAcronyms(options.textCase),
        });
    },
});
