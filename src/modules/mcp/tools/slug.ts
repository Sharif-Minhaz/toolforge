import { z } from "zod";

import {
    DEFAULT_SLUG_OPTIONS,
    MAX_SLUG_INPUT_LENGTH,
    MAX_SLUG_LENGTH,
} from "@/modules/slug/domain/constants";
import { slugify } from "@/modules/slug/domain/slugify";
import { customSeparatorSchema, slugSeparatorSchema } from "@/modules/slug/validation/slug-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const slugCreateTool = defineMcpTool({
    toolId: "slug",
    verb: "create",
    title: "Slugify text",
    description:
        "Turn a title into a URL slug: fold accents to ASCII, drop punctuation, and join the words with a separator. Can strip English stop words and digits, cap the length at a word boundary, and slugify each line separately for a batch of headings.",
    kind: "offline",
    inputSchema: z.object({
        text: z.string().max(MAX_SLUG_INPUT_LENGTH).describe("The title, or one title per line"),
        separator: slugSeparatorSchema.default(DEFAULT_SLUG_OPTIONS.separator),
        customSeparator: customSeparatorSchema
            .default(DEFAULT_SLUG_OPTIONS.customSeparator)
            .describe("Used only when `separator` is `custom`; must be URL-safe punctuation"),
        lowercase: z.boolean().default(DEFAULT_SLUG_OPTIONS.lowercase),
        ascii: z
            .boolean()
            .default(DEFAULT_SLUG_OPTIONS.ascii)
            .describe("Fold accents and drop anything with no ASCII form"),
        stripStopWords: z.boolean().default(DEFAULT_SLUG_OPTIONS.stripStopWords),
        stripNumbers: z.boolean().default(DEFAULT_SLUG_OPTIONS.stripNumbers),
        maxLength: z
            .number()
            .int()
            .min(0)
            .max(MAX_SLUG_LENGTH)
            .default(DEFAULT_SLUG_OPTIONS.maxLength)
            .describe("0 means no ceiling"),
        perLine: z.boolean().default(DEFAULT_SLUG_OPTIONS.perLine),
    }),
    run: ({ text, ...options }) => {
        const result = slugify(text, options);

        if (!result.ok) {
            return refuseWithReason("Slug generator", result.reason, {
                character: result.character ?? null,
            });
        }

        return succeed(result.slug, {
            slug: result.slug,
            length: result.length,
            words: result.words,
            truncated: result.truncated,
        });
    },
});
