import { civilFromDays, daysFromCivil } from "@/modules/tools/domain/calendar";
import type { CivilDate, HijriDate } from "../types";

/**
 * The tabular Islamic calendar — the civil variant, counted from Friday
 * 16 July 622 (Julian), with leap years 2, 5, 7, 10, 13, 16, 18, 21, 24, 26
 * and 29 of each thirty-year cycle. It is what ICU calls `islamic-civil`, and
 * the tests hold it to `Intl` for every day across a century.
 *
 * Integer arithmetic rather than `Intl`, so the page, the server render and
 * the MCP adapter give the same date on any engine.
 *
 * Bangladesh does not use it. Its months begin on a local moon sighting,
 * announced by the Islamic Foundation, and land a day or two either side of
 * any arithmetic calendar — which is what `adjustment` is for: the date is
 * read off the day `adjustment` days away.
 *
 * After Reingold & Dershowitz, *Calendrical Calculations*.
 */

/** 1 Muharram 1 AH, in days from 1970-01-01. */
const EPOCH = -492_148;

function daysBeforeMonth(month: number): number {
    // Odd months 30 days, even months 29.
    return 29 * (month - 1) + Math.floor(month / 2);
}

function hijriToDayNumber(year: number, month: number, day: number): number {
    return (
        EPOCH -
        1 +
        (year - 1) * 354 +
        Math.floor((3 + 11 * year) / 30) +
        daysBeforeMonth(month) +
        day
    );
}

export function isHijriLeapYear(year: number): boolean {
    return (((14 + 11 * year) % 30) + 30) % 30 < 11;
}

export function getHijriMonthLength(year: number, month: number): number {
    if (month === 12) {
        return isHijriLeapYear(year) ? 30 : 29;
    }

    return month % 2 === 1 ? 30 : 29;
}

export function toHijriDate(date: CivilDate, adjustment = 0): HijriDate {
    const dayNumber = daysFromCivil(date.year, date.month, date.day) + adjustment;
    const year = Math.floor((30 * (dayNumber - EPOCH) + 10_646) / 10_631);
    const sinceNewYear = dayNumber - hijriToDayNumber(year, 1, 1);
    const month = Math.min(12, Math.floor((11 * sinceNewYear + 330) / 325));
    const day = dayNumber - hijriToDayNumber(year, month, 1) + 1;

    return { year, month, day };
}

/** `null` for a day the month does not have. The inverse of {@link toHijriDate}. */
export function fromHijriDate(
    year: number,
    month: number,
    day: number,
    adjustment = 0,
): CivilDate | null {
    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        year < 1 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > getHijriMonthLength(year, month)
    ) {
        return null;
    }

    return civilFromDays(hijriToDayNumber(year, month, day) - adjustment);
}
