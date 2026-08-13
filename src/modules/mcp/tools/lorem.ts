import { z } from "zod";

import {
    DEFAULT_LOREM_OPTIONS,
    MAX_LOREM_PARAGRAPHS,
    MIN_LOREM_PARAGRAPHS,
} from "@/modules/lorem/domain/constants";
import { generateRandomText } from "@/modules/lorem/domain/generate";
import {
    loremAmountSchema,
    loremFormatSchema,
    loremSourceSchema,
    loremUnitSchema,
} from "@/modules/lorem/validation/generation-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const loremGenerateTool = defineMcpTool({
    toolId: "lorem",
    verb: "generate",
    title: "Generate placeholder text",
    description:
        "Generate placeholder copy by word, character, sentence or paragraph count, from a choice of corpora — classical Lorem Ipsum, plain English, Bangla, emoji and others — as plain text or HTML paragraphs. Use it to fill a layout, not to produce meaning: the output is deliberately nonsense.",
    kind: "offline",
    inputSchema: z.object({
        source: loremSourceSchema.default(DEFAULT_LOREM_OPTIONS.source),
        unit: loremUnitSchema.default(DEFAULT_LOREM_OPTIONS.unit),
        amount: loremAmountSchema
            .default(DEFAULT_LOREM_OPTIONS.amount)
            .describe("How many of `unit` in total"),
        paragraphs: z
            .number()
            .int()
            .min(MIN_LOREM_PARAGRAPHS)
            .max(MAX_LOREM_PARAGRAPHS)
            .default(DEFAULT_LOREM_OPTIONS.paragraphs)
            .describe("How many paragraphs the amount spreads across. Ignored for `paragraphs`"),
        startWithOpener: z
            .boolean()
            .default(DEFAULT_LOREM_OPTIONS.startWithOpener)
            .describe("Lead with the corpus's canonical opening words"),
        format: loremFormatSchema.default(DEFAULT_LOREM_OPTIONS.format),
    }),
    run: (options) => {
        const result = generateRandomText(options);

        if (!result.ok) {
            return refuseWithReason("Lorem generator", result.reason);
        }

        return succeed(
            `${result.stats.words} words across ${result.stats.paragraphs} paragraph${
                result.stats.paragraphs === 1 ? "" : "s"
            }`,
            {
                text: result.text,
                blocks: [...result.blocks],
                stats: { ...result.stats },
                lang: result.lang,
            },
        );
    },
});
