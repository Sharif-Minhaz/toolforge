import type { CalendarFacts, ZonedFields } from "../types";

/**
 * Proleptic Gregorian calendar arithmetic, done on integers rather than on
 * `Date`. Keeping it independent means the same functions serve the parser
 * (validating 29 February), the ISO week date reader, and the details panel —
 * and none of them can pick up the host machine's zone by accident.
 */

const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
    return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

export function getDaysInYear(year: number): number {
    return isLeapYear(year) ? 366 : 365;
}

/**
 * Days between 1970-01-01 and the given civil date, after Howard Hinnant's
 * `days_from_civil`. Valid for any year, including negative ones, which is
 * what `Date` cannot be trusted to do below year 100.
 */
export function daysFromCivil(year: number, month: number, day: number): number {
    const shifted = month <= 2 ? year - 1 : year;
    const era = Math.floor(shifted / 400);
    const yearOfEra = shifted - era * 400;
    const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
    const dayOfEra =
        yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

    return era * 146_097 + dayOfEra - 719_468;
}

/** The inverse of {@link daysFromCivil}. */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
    const shifted = days + 719_468;
    const era = Math.floor(shifted / 146_097);
    const dayOfEra = shifted - era * 146_097;
    const yearOfEra = Math.floor(
        (dayOfEra -
            Math.floor(dayOfEra / 1460) +
            Math.floor(dayOfEra / 36524) -
            Math.floor(dayOfEra / 146_096)) /
            365,
    );
    const year = yearOfEra + era * 400;
    const dayOfYear =
        dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
    const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
    const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
    const month = monthPrime + (monthPrime < 10 ? 3 : -9);

    return { year: month <= 2 ? year + 1 : year, month, day };
}

/** 1 for 1 January, 366 at the end of a leap year. */
export function getDayOfYear(year: number, month: number, day: number): number {
    return daysFromCivil(year, month, day) - daysFromCivil(year, 1, 1) + 1;
}

/** 1 = Monday through 7 = Sunday, as ISO 8601 numbers them. */
export function getIsoDayOfWeek(year: number, month: number, day: number): number {
    const days = daysFromCivil(year, month, day);

    // 1970-01-01 was a Thursday, ISO day 4.
    return ((((days + 3) % 7) + 7) % 7) + 1;
}

function isoWeeksInYear(year: number): number {
    const jumps = (y: number) =>
        (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7;

    return jumps(year) === 4 || jumps(year - 1) === 3 ? 53 : 52;
}

export type IsoWeek = {
    readonly week: number;
    /** Differs from the calendar year in the first and last days of January and December. */
    readonly weekYear: number;
};

export function getIsoWeek(year: number, month: number, day: number): IsoWeek {
    const week = Math.floor(
        (getDayOfYear(year, month, day) - getIsoDayOfWeek(year, month, day) + 10) / 7,
    );

    if (week < 1) {
        return { week: isoWeeksInYear(year - 1), weekYear: year - 1 };
    }

    if (week > isoWeeksInYear(year)) {
        return { week: 1, weekYear: year + 1 };
    }

    return { week, weekYear: year };
}

/** `2026-W31-3` — the ISO 8601 week date. */
export function formatIsoWeekDate(year: number, month: number, day: number): string {
    const { week, weekYear } = getIsoWeek(year, month, day);
    const paddedYear = String(Math.abs(weekYear)).padStart(4, "0");
    const sign = weekYear < 0 ? "-" : "";

    return `${sign}${paddedYear}-W${String(week).padStart(2, "0")}-${getIsoDayOfWeek(year, month, day)}`;
}

export function getQuarter(month: number): number {
    return Math.floor((month - 1) / 3) + 1;
}

/** Civil date for the nth day of `year`, used by the ISO ordinal-date reader. */
export function fromOrdinalDate(year: number, ordinal: number): { month: number; day: number } {
    const { month, day } = civilFromDays(daysFromCivil(year, 1, 1) + ordinal - 1);

    return { month, day };
}

/** Civil date for an ISO week date, used by the `2026-W31-3` reader. */
export function fromIsoWeekDate(
    weekYear: number,
    week: number,
    weekday: number,
): { year: number; month: number; day: number } {
    // The Monday of week 1 is the Monday of the week holding 4 January.
    const january4 = daysFromCivil(weekYear, 1, 4);
    const firstMonday = january4 - (getIsoDayOfWeek(weekYear, 1, 4) - 1);

    return civilFromDays(firstMonday + (week - 1) * 7 + (weekday - 1));
}

export function isValidIsoWeek(weekYear: number, week: number): boolean {
    return week >= 1 && week <= isoWeeksInYear(weekYear);
}

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
