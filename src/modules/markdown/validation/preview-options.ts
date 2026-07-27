import { z } from "zod";

import { MARKDOWN_EXPORT_FORMATS, MARKDOWN_VIEW_MODES } from "../types";
import { MAX_SHARED_TEXT_LENGTH } from "../domain/constants";

export const markdownViewModeSchema = z.enum(MARKDOWN_VIEW_MODES);

export const markdownExportFormatSchema = z.enum(MARKDOWN_EXPORT_FORMATS);

/** `1`/`0` reads better in a shared link than `true`/`false`. */
const booleanFlagSchema = z
    .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
    .transform((value) => value === "1" || value === "true");

/**
 * Search-param shape for `/tools/markdown?view=preview&sync=0&text=%23%20Hi`.
 * Each field catches on its own, so one malformed value degrades to its default
 * instead of throwing the whole page away.
 */
export const markdownSearchParamsSchema = z.object({
    view: markdownViewModeSchema.optional().catch(undefined),
    sync: booleanFlagSchema.optional().catch(undefined),
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
});

export const markdownPreviewOptionsSchema = z.object({
    view: markdownViewModeSchema,
    syncScroll: z.boolean(),
});

export type MarkdownPreviewOptionsInput = z.input<typeof markdownPreviewOptionsSchema>;
