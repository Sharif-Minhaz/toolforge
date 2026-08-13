import { z } from "zod";

import { analyzeCron } from "@/modules/cron/domain/analyze";
import { DEFAULT_RUN_COUNT, DEFAULT_WEEKDAY_BASE } from "@/modules/cron/domain/constants";
import { formatIsoInZone } from "@/modules/cron/domain/format";
import {
    cronExpressionSchema,
    cronRunCountSchema,
    cronTimeZoneSchema,
    cronWeekdayBaseSchema,
} from "@/modules/cron/validation/cron-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * When a cron expression actually fires, and what each field means.
 *
 * The page's prose explanation is a structure the presenter turns into a
 * localised sentence, so it is not what comes back here — inventing an English
 * rendering of it would be a second explainer to keep in step with the first.
 * What comes back is the field breakdown and the next run times, which is the
 * part a model cannot derive for itself and the part people are actually
 * asking about.
 *
 * `skipped` is passed through deliberately. A schedule that names a wall clock
 * a spring-forward transition erases is the bug this tool exists to surface,
 * and it would be invisible in a list of instants.
 */
export const cronExplainTool = defineMcpTool({
    toolId: "cron",
    verb: "explain",
    title: "Explain a cron expression",
    description:
        "Parse a cron expression and return the next run times in a given time zone, plus a field-by-field breakdown of what it matches. Handles 5, 6 and 7 field forms, the `@daily`-style macros, and Quartz extensions (`?`, `L`, `W`, `#`). Reports run times that a daylight-saving jump would erase rather than hiding them.",
    kind: "offline",
    inputSchema: z.object({
        expression: cronExpressionSchema.describe("e.g. `*/5 * * * *` or `@daily`"),
        timeZone: cronTimeZoneSchema
            .default("UTC")
            .describe("IANA zone the schedule is read in, e.g. `Asia/Dhaka`"),
        weekdayBase: cronWeekdayBaseSchema
            .default(DEFAULT_WEEKDAY_BASE)
            .describe("`unix` numbers Sunday 0; `quartz` numbers Sunday 1"),
        runCount: cronRunCountSchema.default(DEFAULT_RUN_COUNT),
        from: z
            .string()
            .default("")
            .describe("ISO 8601 instant to search forward from. Defaults to now"),
    }),
    run: ({ expression, timeZone, weekdayBase, runCount, from }) => {
        const now = from.length === 0 ? Date.now() : Date.parse(from);

        if (Number.isNaN(now)) {
            return refuseWithReason("Cron parser", "invalid_from");
        }

        const analysis = analyzeCron({ expression, weekdayBase, timeZone, runCount, now });

        if (!analysis.ok) {
            return refuseWithReason("Cron parser", analysis.reason, {
                field: analysis.field ?? null,
                token: analysis.token ?? null,
            });
        }

        const runs = analysis.schedule.runs.map((run) => formatIsoInZone(run, analysis.timeZone));

        return succeed(
            analysis.expression.reboot
                ? "Fires once at boot, never on a clock"
                : `Next run ${runs[0] ?? "never"} (${analysis.timeZone})`,
            {
                source: analysis.expression.source,
                fieldCount: analysis.expression.fieldCount,
                macro: analysis.expression.macro ?? null,
                reboot: analysis.expression.reboot,
                hasSeconds: analysis.expression.hasSeconds,
                timeZone: analysis.timeZone,
                // False means the runtime did not know the requested zone and
                // the answer is in UTC. Silently substituting would be a lie.
                timeZoneSupported: analysis.timeZoneSupported,
                runs,
                exhausted: analysis.schedule.exhausted,
                skippedByDaylightSaving: analysis.schedule.skipped,
                fields: Object.values(analysis.expression.fields).map((field) => ({
                    name: field.name,
                    raw: field.raw,
                    star: field.star,
                    unspecified: field.unspecified,
                    values: [...field.values],
                })),
            },
        );
    },
});
