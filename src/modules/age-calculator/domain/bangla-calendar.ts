import { civilFromDays, daysFromCivil, isLeapYear } from "@/modules/tools/domain/calendar";
import type { BanglaDate, BanglaRule, CivilDate } from "../types";
import { BANGLA_1987_FIRST_YEAR, BANGLA_2019_FIRST_YEAR } from "./constants";

/**
 * Bangladesh's Bangla calendar (বঙ্গাব্দ), as Bangla Academy fixed it.
 *
 * Both revisions pin 1 Boishakh to 14 April and give Falgun the leap day, so
 * the two calendars never drift apart. What changed in 2019 is which months
 * are long: the 1987 calendar put 21 February on 9 Falgun and 16 December on
 * 2 Poush; moving Ashwin to 31 days and Falgun to 29 put them back on 8 Falgun
 * and 1 Poush, the days 1952 and 1971 actually happened on.
 *
 * Dates are converted under the revision that was in force on them, because
 * that is what a certificate issued at the time says. Before 1394 BS there was
 * no fixed calendar at all — the almanac set each month — so the 1987 lengths
 * are applied backwards and the date is flagged.
 *
 * West Bengal's calendar is a different, astronomical one, and is not this.
 */

/** BS year Y begins on 14 April of Gregorian year Y + 593. */
const GREGORIAN_OFFSET = 593;

const NEW_YEAR_MONTH = 4;
const NEW_YEAR_DAY = 14;

/** Falgun is the eleventh month. */
const FALGUN = 11;

export function banglaRuleFor(banglaYear: number): BanglaRule {
    return banglaYear >= BANGLA_2019_FIRST_YEAR ? "2019" : "1987";
}

/**
 * Falgun of BS year Y runs through late February of Gregorian year Y + 594, so
 * it takes the leap day exactly when that year has one.
 */
export function isBanglaLeapYear(banglaYear: number): boolean {
    return isLeapYear(banglaYear + GREGORIAN_OFFSET + 1);
}

/** Days in a Bangla month under the revision in force in that year. */
export function getBanglaMonthLength(banglaYear: number, month: number): number {
    const rule = banglaRuleFor(banglaYear);
    const leap = isBanglaLeapYear(banglaYear);

    if (month === FALGUN) {
        return rule === "2019" ? (leap ? 30 : 29) : leap ? 31 : 30;
    }

    const longMonths = rule === "2019" ? 6 : 5;

    return month <= longMonths ? 31 : 30;
}

function newYearDayNumber(banglaYear: number): number {
    return daysFromCivil(banglaYear + GREGORIAN_OFFSET, NEW_YEAR_MONTH, NEW_YEAR_DAY);
}

export function toBanglaDate(date: CivilDate): BanglaDate {
    const dayNumber = daysFromCivil(date.year, date.month, date.day);
    const beforeNewYear =
        date.month < NEW_YEAR_MONTH || (date.month === NEW_YEAR_MONTH && date.day < NEW_YEAR_DAY);
    const year = date.year - GREGORIAN_OFFSET - (beforeNewYear ? 1 : 0);

    let remaining = dayNumber - newYearDayNumber(year);
    let month = 1;

    while (remaining >= getBanglaMonthLength(year, month)) {
        remaining -= getBanglaMonthLength(year, month);
        month += 1;
    }

    return {
        year,
        month,
        day: remaining + 1,
        rule: banglaRuleFor(year),
        beforeReform: year < BANGLA_1987_FIRST_YEAR,
    };
}

/** `null` for a day the month does not have — 31 Kartik, or 30 Falgun in a common year since 2019. */
export function fromBanglaDate(year: number, month: number, day: number): CivilDate | null {
    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > getBanglaMonthLength(year, month)
    ) {
        return null;
    }

    let dayNumber = newYearDayNumber(year) + day - 1;

    for (let earlier = 1; earlier < month; earlier += 1) {
        dayNumber += getBanglaMonthLength(year, earlier);
    }

    return civilFromDays(dayNumber);
}
