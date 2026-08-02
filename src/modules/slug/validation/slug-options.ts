import { z } from "zod";

import { MAX_SEPARATOR_LENGTH, MAX_SHARED_TEXT_LENGTH, MAX_SLUG_LENGTH } from "../domain/constants";
import { SLUG_SEPARATORS } from "../types";

export const slugSeparatorSchema = z.enum(SLUG_SEPARATORS);

export const customSeparatorSchema = z.string().max(MAX_SEPARATOR_LENGTH);

export const slugOptionsSchema = z.object({
    separator: slugSeparatorSchema,
    customSeparator: customSeparatorSchema,
    lowercase: z.boolean(),
    ascii: z.boolean(),
    stripStopWords: z.boolean(),
    stripNumbers: z.boolean(),
    maxLength: z.number().int().min(0).max(MAX_SLUG_LENGTH),
    perLine: z.boolean(),
});

/**
 * Search-param shape for `/tools/slug?text=Hello+World&separator=custom&custom=~`.
 * Each field catches on its own, so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const slugSearchParamsSchema = z.object({
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    separator: slugSeparatorSchema.optional().catch(undefined),
    custom: customSeparatorSchema.optional().catch(undefined),
});
