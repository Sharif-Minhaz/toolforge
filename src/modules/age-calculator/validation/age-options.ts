import { z } from "zod";

import { MAX_DATE_INPUT_LENGTH, MAX_HIJRI_ADJUSTMENT, MAX_LIMIT_YEARS } from "../domain/constants";
import { AGE_MODES, CALENDARS } from "../types";

export const ageModeSchema = z.enum(AGE_MODES);
export const calendarSchema = z.enum(CALENDARS);

/** A date exactly as typed — the domain reads it, so this only bounds its size. */
export const dateInputSchema = z.string().max(MAX_DATE_INPUT_LENGTH);

export const limitYearsSchema = z.number().int().min(0).max(MAX_LIMIT_YEARS);

export const hijriAdjustmentSchema = z
    .number()
    .int()
    .min(-MAX_HIJRI_ADJUSTMENT)
    .max(MAX_HIJRI_ADJUSTMENT);

/** `8-11-1431`: day, month number, year, in whichever calendar `cal` names. */
const calendarDateParamSchema = z
    .string()
    .max(MAX_DATE_INPUT_LENGTH)
    .regex(/^\d{1,2}-\d{1,2}-\d{1,4}$/);

/**
 * Search-param shape for
 * `/tools/age-calculator?dob=12/05/1998&on=31/12/2026&max=30&alt=25/03/2020`
 * and `/tools/age-calculator?mode=convert&cal=bangla&date=8-11-1431`.
 * Each field catches on its own, so one malformed value degrades to the
 * default instead of throwing the page away.
 */
export const ageSearchParamsSchema = z.object({
    mode: ageModeSchema.optional().catch(undefined),
    dob: dateInputSchema.optional().catch(undefined),
    on: dateInputSchema.optional().catch(undefined),
    alt: dateInputSchema.optional().catch(undefined),
    min: z.coerce.number().pipe(limitYearsSchema).optional().catch(undefined),
    max: z.coerce.number().pipe(limitYearsSchema).optional().catch(undefined),
    hadj: z.coerce.number().pipe(hijriAdjustmentSchema).optional().catch(undefined),
    cal: calendarSchema.optional().catch(undefined),
    date: calendarDateParamSchema.optional().catch(undefined),
});

export type AgeSearchParams = z.infer<typeof ageSearchParamsSchema>;
