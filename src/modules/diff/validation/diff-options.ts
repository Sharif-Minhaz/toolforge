import { z } from "zod";

import { MAX_DIFF_INPUT_LENGTH } from "../domain/constants";
import { DIFF_PRECISIONS, DIFF_VIEWS } from "../types";

export const diffViewSchema = z.enum(DIFF_VIEWS);

export const diffPrecisionSchema = z.enum(DIFF_PRECISIONS);

export const diffTextSchema = z.string().max(MAX_DIFF_INPUT_LENGTH);

export const diffOptionsSchema = z.object({
    precision: diffPrecisionSchema,
    ignoreCase: z.boolean(),
    ignoreWhitespace: z.boolean(),
});

/**
 * Search-param shape for `/tools/diff?view=unified&precision=char`. Each field
 * catches on its own, so one malformed value opens on a default instead of
 * throwing the whole page away.
 *
 * The two texts are deliberately absent: a pair of files does not belong in a
 * query string, and nothing typed here ever leaves the browser.
 */
export const diffSearchParamsSchema = z.object({
    view: diffViewSchema.optional().catch(undefined),
    precision: diffPrecisionSchema.optional().catch(undefined),
});
