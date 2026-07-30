import { z } from "zod";

import { ATTACK_MODELS, PASSWORD_MODES, PASSWORD_SEPARATORS } from "../types";
import { PASSWORD_LENGTH_RANGE } from "../domain/constants";

export const passwordModeSchema = z.enum(PASSWORD_MODES);

export const passwordSeparatorSchema = z.enum(PASSWORD_SEPARATORS);

export const attackModelSchema = z.enum(ATTACK_MODELS);

/**
 * The widest range any mode allows. A link carries the mode and the length as
 * separate params and either may be missing, so the per-mode range can only be
 * applied once both are known — `clampLength` does that in the page.
 */
const WIDEST_RANGE = {
    min: Math.min(...Object.values(PASSWORD_LENGTH_RANGE).map((range) => range.min)),
    max: Math.max(...Object.values(PASSWORD_LENGTH_RANGE).map((range) => range.max)),
};

export const passwordLengthSchema = z.coerce
    .number()
    .int()
    .min(WIDEST_RANGE.min)
    .max(WIDEST_RANGE.max);

export const passwordOptionsSchema = z.object({
    mode: passwordModeSchema,
    length: passwordLengthSchema,
    uppercase: z.boolean(),
    lowercase: z.boolean(),
    numbers: z.boolean(),
    symbols: z.boolean(),
    excludeSimilar: z.boolean(),
    excludeAmbiguous: z.boolean(),
    separator: passwordSeparatorSchema,
    capitalize: z.boolean(),
    includeNumber: z.boolean(),
    attack: attackModelSchema,
});

export type PasswordOptionsInput = z.input<typeof passwordOptionsSchema>;

/** A query string carries strings, so a switch arrives as one of these four. */
const booleanParamSchema = z
    .enum(["true", "false", "1", "0"])
    .transform((value) => value === "true" || value === "1");

/**
 * Search-param shape for `/tools/password?mode=memorable&length=6&words=1`.
 *
 * Every field catches its own failure, so one malformed value opens the tool on
 * its default rather than returning a 500. Deliberately absent: the password
 * itself. A generated secret never goes in a URL, where it would land in browser
 * history, the referrer header and every proxy log on the way.
 */
export const passwordSearchParamsSchema = z.object({
    mode: passwordModeSchema.optional().catch(undefined),
    length: passwordLengthSchema.optional().catch(undefined),
    upper: booleanParamSchema.optional().catch(undefined),
    lower: booleanParamSchema.optional().catch(undefined),
    numbers: booleanParamSchema.optional().catch(undefined),
    symbols: booleanParamSchema.optional().catch(undefined),
    noSimilar: booleanParamSchema.optional().catch(undefined),
    noAmbiguous: booleanParamSchema.optional().catch(undefined),
    separator: passwordSeparatorSchema.optional().catch(undefined),
    caps: booleanParamSchema.optional().catch(undefined),
    digit: booleanParamSchema.optional().catch(undefined),
    attack: attackModelSchema.optional().catch(undefined),
});
