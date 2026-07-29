import { z } from "zod";

import { isKnownTimeZone } from "@/modules/tools/domain/time-zones";
import { MAX_EXPRESSION_LENGTH, MAX_RUN_COUNT, MIN_RUN_COUNT } from "../domain/constants";
import { CRON_WEEKDAY_BASES } from "../types";

export const cronWeekdayBaseSchema = z.enum(CRON_WEEKDAY_BASES);

/**
 * A zone is only valid if the shipped snapshot has it. Checking the literal
 * list rather than trying `Intl` keeps validation identical on the server and
 * in the browser, which is the same reason the list is frozen at all.
 */
export const cronTimeZoneSchema = z.string().refine(isKnownTimeZone, {
    message: "Unknown IANA time zone",
});

export const cronRunCountSchema = z.coerce.number().int().min(MIN_RUN_COUNT).max(MAX_RUN_COUNT);

export const cronExpressionSchema = z.string().max(MAX_EXPRESSION_LENGTH);

export const cronOptionsSchema = z.object({
    expression: cronExpressionSchema,
    weekdayBase: cronWeekdayBaseSchema,
    timeZone: cronTimeZoneSchema,
    runCount: cronRunCountSchema,
});

export type CronOptionsInput = z.input<typeof cronOptionsSchema>;

/**
 * Search-param shape for `/tools/cron?expr=0+9+*+*+MON-FRI&tz=Asia/Dhaka`.
 *
 * Every field catches on its own, so one stale value in a shared link opens on
 * a default instead of throwing the page away — a schedule someone pasted into
 * a ticket is exactly the kind of link that goes stale.
 */
export const cronSearchParamsSchema = z.object({
    expr: cronExpressionSchema.optional().catch(undefined),
    tz: cronTimeZoneSchema.optional().catch(undefined),
    base: cronWeekdayBaseSchema.optional().catch(undefined),
    runs: cronRunCountSchema.optional().catch(undefined),
});
