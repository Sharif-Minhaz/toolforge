import { getZonedFields, isFormattableTimeZone } from "@/modules/tools/domain/zone";
import type {
    CalendarFacts,
    EpochRendering,
    EpochUnit,
    ParsedTimestamp,
    TimestampFailure,
    ZonedRendering,
} from "../types";
import { buildCalendarFacts } from "./calendar-facts";
import { renderEpochs, renderRelative, renderZone } from "./format";
import { parseTimestamp } from "./parse";

export type TimestampConversionRequest = {
    readonly input: string;
    readonly unit: EpochUnit;
    readonly inputTimeZone: string;
    /**
     * Zones to render, in display order. The first one is treated as the
     * reader's own: the calendar facts and the "today" comparison are worked
     * out against it.
     */
    readonly timeZones: readonly string[];
    readonly locale: string;
    /** Injected so `now`, relative time and "days from today" are testable. */
    readonly now: Date;
};

export type TimestampConversionSuccess = ParsedTimestamp & {
    readonly epochs: EpochRendering;
    readonly zones: readonly ZonedRendering[];
    readonly facts: CalendarFacts;
    /** Calendar facts belong to one zone; this is the one they were read in. */
    readonly factsTimeZone: string;
    readonly relative: string;
    /** Requested zones this engine's data does not know; rendered as a notice. */
    readonly unsupportedTimeZones: readonly string[];
};

export type TimestampConversionResult = TimestampConversionSuccess | TimestampFailure;

/**
 * The one conversion the whole tool runs, shared by the server-rendered first
 * paint and every settled keystroke afterwards. Pure given `now`, so hydration
 * has nothing to reconcile.
 */
export function convert(request: TimestampConversionRequest): TimestampConversionResult {
    const parsed = parseTimestamp({
        input: request.input,
        unit: request.unit,
        inputTimeZone: request.inputTimeZone,
        now: request.now,
    });

    if (!parsed.ok) {
        return parsed;
    }

    // The zone list is a frozen snapshot, so an engine with older data may not
    // know every id. Dropping one here beats a picker whose options differ
    // between the server render and the browser.
    const supported = request.timeZones.filter(isFormattableTimeZone);
    const unsupportedTimeZones = request.timeZones.filter((zone) => !isFormattableTimeZone(zone));
    const factsTimeZone = supported[0] ?? "UTC";

    return {
        ...parsed,
        epochs: renderEpochs(parsed.epochMs, parsed.subMilliNanos),
        zones: supported.map((zone) => renderZone(parsed.epochMs, zone, request.locale)),
        facts: buildCalendarFacts(
            getZonedFields(parsed.epochMs, factsTimeZone),
            getZonedFields(request.now.getTime(), factsTimeZone),
        ),
        factsTimeZone,
        relative: renderRelative(parsed.epochMs, request.now.getTime(), request.locale),
        unsupportedTimeZones,
    };
}
