import {
    daysFromCivil,
    formatIsoWeekDate,
    getDayOfYear,
    getDaysInMonth,
    getIsoWeek,
    getQuarter,
    isLeapYear,
} from "@/modules/tools/domain/calendar";
import type { ZonedFields } from "@/modules/tools/types";
import type { CalendarFacts } from "../types";

/**
 * Everything the details panel says about the instant that does not depend on
 * how it is written down. `today` is the reader's current wall clock in the
 * same zone, so "3 days from now" counts calendar days rather than 72 hours.
 */
export function buildCalendarFacts(fields: ZonedFields, today: ZonedFields): CalendarFacts {
    const { week, weekYear } = getIsoWeek(fields.year, fields.month, fields.day);

    return {
        dayOfYear: getDayOfYear(fields.year, fields.month, fields.day),
        isoWeek: week,
        isoWeekYear: weekYear,
        isoWeekDate: formatIsoWeekDate(fields.year, fields.month, fields.day),
        quarter: getQuarter(fields.month),
        daysInMonth: getDaysInMonth(fields.year, fields.month),
        leapYear: isLeapYear(fields.year),
        dayOffsetFromToday:
            daysFromCivil(fields.year, fields.month, fields.day) -
            daysFromCivil(today.year, today.month, today.day),
    };
}
