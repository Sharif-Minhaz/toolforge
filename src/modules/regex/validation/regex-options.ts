import { z } from "zod";

import {
    MAX_PATTERN_LENGTH,
    MAX_REPLACEMENT_LENGTH,
    MAX_TEST_STRING_LENGTH,
} from "../domain/constants";
import { parseFlagLetters } from "../domain/flags";
import { REGEX_DELIMITERS, REGEX_FLAGS, REGEX_MODES } from "../types";

export const regexModeSchema = z.enum(REGEX_MODES);

export const regexDelimiterSchema = z.enum(REGEX_DELIMITERS);

export const regexFlagSchema = z.enum(REGEX_FLAGS);

export const regexFlagsSchema = z.array(regexFlagSchema);

export const regexAnalysisRequestSchema = z.object({
    pattern: z.string().max(MAX_PATTERN_LENGTH),
    flags: regexFlagsSchema,
    mode: regexModeSchema,
    replacement: z.string().max(MAX_REPLACEMENT_LENGTH),
    testString: z.string().max(MAX_TEST_STRING_LENGTH),
});

export type RegexAnalysisRequestInput = z.input<typeof regexAnalysisRequestSchema>;

/**
 * A shared link carries flags the way a literal writes them — `flags=gmi` — so
 * the URL stays readable and short. Unknown letters are dropped rather than
 * rejected, which is what makes a link from a newer build degrade quietly.
 */
const flagLettersSchema = z
    .string()
    .max(REGEX_FLAGS.length * 2)
    .transform((letters) => parseFlagLetters(letters));

/**
 * Search-param shape for `/tools/regex?pattern=…&flags=gm&mode=list`. Each
 * field catches on its own so one malformed value degrades to its default
 * instead of throwing the whole page away.
 */
export const regexSearchParamsSchema = z.object({
    pattern: z.string().max(MAX_PATTERN_LENGTH).optional().catch(undefined),
    flags: flagLettersSchema.optional().catch(undefined),
    mode: regexModeSchema.optional().catch(undefined),
    delimiter: regexDelimiterSchema.optional().catch(undefined),
    replacement: z.string().max(MAX_REPLACEMENT_LENGTH).optional().catch(undefined),
    test: z.string().max(MAX_TEST_STRING_LENGTH).optional().catch(undefined),
});
