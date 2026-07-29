import { describe, expect, test } from "bun:test";

import { buildCalendarFacts } from "@/modules/timestamp/domain/calendar-facts";
import type { ZonedFields } from "@/modules/tools/types";

function fields(year: number, month: number, day: number): ZonedFields {
    return { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 };
}

describe("buildCalendarFacts", () => {
    test("describes the instant against the reader's today", () => {
        expect(buildCalendarFacts(fields(2026, 7, 29), fields(2026, 7, 26))).toEqual({
            dayOfYear: 210,
            isoWeek: 31,
            isoWeekYear: 2026,
            isoWeekDate: "2026-W31-3",
            quarter: 3,
            daysInMonth: 31,
            leapYear: false,
            dayOffsetFromToday: 3,
        });
    });

    test("counts calendar days, not elapsed hours", () => {
        const justBeforeMidnight: ZonedFields = { ...fields(2026, 7, 29), hour: 23, minute: 59 };
        const justAfterMidnight: ZonedFields = { ...fields(2026, 7, 30), hour: 0, minute: 1 };

        expect(buildCalendarFacts(justAfterMidnight, justBeforeMidnight).dayOffsetFromToday).toBe(
            1,
        );
    });
});
