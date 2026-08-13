import { z } from "zod";

import { DEFAULT_INPUT_TIME_ZONE, DEFAULT_UNIT } from "@/modules/timestamp/domain/constants";
import { renderEpochs, renderZone } from "@/modules/timestamp/domain/format";
import { parseTimestamp } from "@/modules/timestamp/domain/parse";
import { buildCalendarFacts } from "@/modules/timestamp/domain/calendar-facts";
import { getZonedFields } from "@/modules/tools/domain/zone";
import { epochUnitSchema, timeZoneSchema } from "@/modules/timestamp/validation/timestamp-options";
import { MAX_MCP_LIST_LENGTH } from "../domain/constants";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * One instant, read from anything and told in as many zones as were asked for.
 *
 * The unit defaults to `auto`, which is the whole trick of the page: ten digits
 * are seconds, thirteen are milliseconds, and a caller that has to know which
 * before it can ask has not been helped. The reading is reported back so a
 * wrong guess is visible rather than silent.
 *
 * Renderings are locale-formatted, and the locale is an argument rather than
 * the site's. A model asking on behalf of somebody reading Bangla wants Bengali
 * numerals in `fullDate`; `iso8601` and the epoch strings stay Western digits
 * regardless, because those are machine formats.
 */
export const timestampConvertTool = defineMcpTool({
    toolId: "timestamp",
    verb: "convert",
    title: "Convert a timestamp",
    description:
        "Read a timestamp — unix seconds/milliseconds/microseconds/nanoseconds, ISO 8601, RFC 2822, a Windows FILETIME, .NET ticks, an Excel serial date, a Mongo ObjectId, or the word `now` — and render it in any IANA time zones you name. Returns every epoch scale as an exact decimal string, the offset and abbreviation per zone, and calendar facts such as ISO week and day of year. Detects the unit of a bare number by magnitude unless you name one.",
    kind: "offline",
    inputSchema: z.object({
        input: z.string().max(2_048).describe("The timestamp in any recognised form, or `now`"),
        unit: epochUnitSchema
            .default(DEFAULT_UNIT)
            .describe("`auto` detects the scale of a bare number from its magnitude"),
        inputTimeZone: timeZoneSchema
            .default(DEFAULT_INPUT_TIME_ZONE)
            .describe("Supplies a zone for input that carries none of its own"),
        timeZones: z
            .array(timeZoneSchema)
            .max(MAX_MCP_LIST_LENGTH)
            .default(["UTC"])
            .describe("IANA zones to render the instant in"),
        locale: z
            .string()
            .max(35)
            .default("en-US")
            .describe("BCP-47 tag for the human-readable renderings"),
    }),
    run: ({ input, unit, inputTimeZone, timeZones, locale }) => {
        const parsed = parseTimestamp({ input, unit, inputTimeZone, now: new Date() });

        if (!parsed.ok) {
            return refuseWithReason("Timestamp parser", parsed.reason, {
                field: parsed.field ?? null,
            });
        }

        const zones = timeZones.length === 0 ? ["UTC"] : timeZones;
        const rendered = zones.map((zone) => renderZone(parsed.epochMs, zone, locale));
        const facts = buildCalendarFacts(
            getZonedFields(parsed.epochMs, inputTimeZone),
            getZonedFields(Date.now(), inputTimeZone),
        );

        return succeed(rendered[0]?.iso8601 ?? String(parsed.epochMs), {
            epochMs: parsed.epochMs,
            readAs: parsed.kind,
            detectedUnit: parsed.unit ?? null,
            usedInputZone: parsed.usedInputZone,
            epochs: { ...renderEpochs(parsed.epochMs, parsed.subMilliNanos) },
            zones: rendered.map((zone) => ({ ...zone })),
            calendar: { ...facts },
        });
    },
});
