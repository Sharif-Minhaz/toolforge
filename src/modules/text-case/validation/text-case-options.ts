import { z } from "zod";

import { MAX_SHARED_TEXT_LENGTH, MAX_TEXT_CASE_INPUT_LENGTH } from "../domain/constants";
import { TEXT_CASES } from "../types";

export const textCaseSchema = z.enum(TEXT_CASES);

export const textCaseInputSchema = z.string().max(MAX_TEXT_CASE_INPUT_LENGTH);

export const textCaseOptionsSchema = z.object({
    textCase: textCaseSchema,
    perLine: z.boolean(),
    preserveAcronyms: z.boolean(),
});

/**
 * Search-param shape for `/tools/text-case?text=hello+world&case=upper`.
 * Each field catches on its own, so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const textCaseSearchParamsSchema = z.object({
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    case: textCaseSchema.optional().catch(undefined),
});
