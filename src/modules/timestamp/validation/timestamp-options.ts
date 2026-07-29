import { z } from "zod";

import { isKnownTimeZone } from "@/modules/tools/domain/time-zones";
import { MAX_INPUT_LENGTH, MAX_PINNED_TIME_ZONES } from "../domain/constants";
import { EPOCH_UNITS } from "../types";

export const epochUnitSchema = z.enum(EPOCH_UNITS);

/**
 * A zone is only valid if the shipped snapshot has it. Checking the literal
 * list rather than trying `Intl` keeps validation identical on the server and
 * in the browser, which is the same reason the list is frozen at all.
 */
export const timeZoneSchema = z.string().refine(isKnownTimeZone, {
    message: "Unknown IANA time zone",
});

export const timestampOptionsSchema = z.object({
    unit: epochUnitSchema,
    inputTimeZone: timeZoneSchema,
    pinnedTimeZones: z.array(timeZoneSchema).max(MAX_PINNED_TIME_ZONES),
});

export type TimestampOptionsInput = z.input<typeof timestampOptionsSchema>;

/**
 * Search-param shape for `/tools/timestamp?t=1785326400&unit=seconds&tz=Asia/Tokyo`.
 *
 * Every field catches on its own, so one stale value in a shared link opens on
 * a default instead of throwing the page away. `tz` is repeatable — Next hands
 * a repeated key over as an array — and is normalised to one here.
 */
export const timestampSearchParamsSchema = z.object({
    t: z.string().max(MAX_INPUT_LENGTH).optional().catch(undefined),
    unit: epochUnitSchema.optional().catch(undefined),
    in: timeZoneSchema.optional().catch(undefined),
    tz: z
        .union([timeZoneSchema, z.array(timeZoneSchema)])
        .transform((value) => (Array.isArray(value) ? value : [value]))
        .transform((zones) => [...new Set(zones)].slice(0, MAX_PINNED_TIME_ZONES))
        .optional()
        .catch(undefined),
});
