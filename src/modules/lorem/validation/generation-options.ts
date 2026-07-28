import { z } from "zod";

import {
    MAX_LOREM_AMOUNT,
    MAX_LOREM_PARAGRAPHS,
    MIN_LOREM_AMOUNT,
    MIN_LOREM_PARAGRAPHS,
} from "../domain/constants";
import { LOREM_FORMATS, LOREM_SOURCES, LOREM_UNITS } from "../types";

export const loremSourceSchema = z.enum(LOREM_SOURCES);

export const loremUnitSchema = z.enum(LOREM_UNITS);

export const loremFormatSchema = z.enum(LOREM_FORMATS);

/**
 * The widest ceiling any unit allows. A link carries the amount and the unit
 * as separate params and either may be missing, so the per-unit ceiling can
 * only be applied once both are known — `clampAmount` does that in the page.
 */
const MAX_ANY_UNIT = Math.max(...Object.values(MAX_LOREM_AMOUNT));

export const loremAmountSchema = z.coerce.number().int().min(MIN_LOREM_AMOUNT).max(MAX_ANY_UNIT);

export const loremParagraphCountSchema = z.coerce
    .number()
    .int()
    .min(MIN_LOREM_PARAGRAPHS)
    .max(MAX_LOREM_PARAGRAPHS);

export const loremOptionsSchema = z.object({
    source: loremSourceSchema,
    unit: loremUnitSchema,
    amount: loremAmountSchema,
    paragraphs: loremParagraphCountSchema,
    startWithOpener: z.boolean(),
    format: loremFormatSchema,
});

export type LoremOptionsInput = z.input<typeof loremOptionsSchema>;

/** A query string carries strings, so a switch arrives as one of these four. */
const booleanParamSchema = z
    .enum(["true", "false", "1", "0"])
    .transform((value) => value === "true" || value === "1");

/** Search-param shape for `/tools/lorem?source=kafka&unit=words&amount=200`. */
export const loremSearchParamsSchema = z.object({
    source: loremSourceSchema.optional().catch(undefined),
    unit: loremUnitSchema.optional().catch(undefined),
    amount: loremAmountSchema.optional().catch(undefined),
    paragraphs: loremParagraphCountSchema.optional().catch(undefined),
    opener: booleanParamSchema.optional().catch(undefined),
    format: loremFormatSchema.optional().catch(undefined),
});
