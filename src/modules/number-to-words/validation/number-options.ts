import { z } from "zod";

import { MAX_NUMBER_INPUT_LENGTH } from "../domain/constants";
import { CURRENCIES, ENGLISH_SCALES, LETTER_CASES, NUMBER_FORMATS } from "../types";

export const numberFormatSchema = z.enum(NUMBER_FORMATS);
export const currencySchema = z.enum(CURRENCIES);
export const englishScaleSchema = z.enum(ENGLISH_SCALES);
export const letterCaseSchema = z.enum(LETTER_CASES);

export const numberInputSchema = z.string().max(MAX_NUMBER_INPUT_LENGTH);

export const numberWordsOptionsSchema = z.object({
    format: numberFormatSchema,
    currency: currencySchema,
    scale: englishScaleSchema,
    letterCase: letterCaseSchema,
    britishAnd: z.boolean(),
    appendOnly: z.boolean(),
});

/**
 * Search-param shape for `/tools/number-to-words?n=1250.50&format=currency&currency=bdt`.
 * Each field catches on its own, so one malformed value degrades to the
 * default instead of throwing the whole page away.
 */
export const numberWordsSearchParamsSchema = z.object({
    n: numberInputSchema.optional().catch(undefined),
    format: numberFormatSchema.optional().catch(undefined),
    currency: currencySchema.optional().catch(undefined),
    scale: englishScaleSchema.optional().catch(undefined),
});
