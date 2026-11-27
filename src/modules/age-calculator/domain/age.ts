import { civilFromDays, daysFromCivil, getDaysInMonth } from "@/modules/tools/domain/calendar";
import type { AgeSpan, AgeTotals, CivilDate, NextBirthday } from "../types";

/**
 * Age in completed years, months and days — the figure a form asks for.
 *
 * The rule is `java.time.Period.between`'s, and the tests hold it to vectors
 * Java produced: subtract the fields; if the day comes out negative, give back
 * a month and count the days from the month-anniversary, moved to the month's
 * last day when the birth day does not exist in it. So somebody born on
 * 31 January is 0 months 28 days old on 28 February and 1 month 1 day on
 * 1 March, and somebody born on 29 February is 11 months 30 days old on
 * 28 February — the answer the subtraction Bangladesh teaches by hand gives.
 *
 * Python's `relativedelta` and date-fns disagree on exactly those month-end
 * days: they call 29 February → 28 February a whole year. That reading would
 * make a leap-day child 18 a day early on a minimum-age check, which is the
 * mistake this tool exists to prevent, so it is not the one followed here.
 *
 * Callers pass `on` no earlier than `birth`.
 */

/** `date` moved by whole months, its day held to the last day of a shorter month. */
export function addMonths(date: CivilDate, months: number): CivilDate {
    const index = date.year * 12 + (date.month - 1) + months;
    const year = Math.floor(index / 12);
    const month = index - year * 12 + 1;

    return { year, month, day: Math.min(date.day, getDaysInMonth(year, month)) };
}

export function addYears(date: CivilDate, years: number): CivilDate {
    return addMonths(date, years * 12);
}

export function addDays(date: CivilDate, days: number): CivilDate {
    return civilFromDays(daysFromCivil(date.year, date.month, date.day) + days);
}

function dayNumber(date: CivilDate): number {
    return daysFromCivil(date.year, date.month, date.day);
}

function completedMonths(birth: CivilDate, on: CivilDate): number {
    const months = (on.year - birth.year) * 12 + (on.month - birth.month);

    return months > 0 && on.day < birth.day ? months - 1 : months;
}

export function computeAge(birth: CivilDate, on: CivilDate): AgeSpan {
    const months = completedMonths(birth, on);
    const days = dayNumber(on) - dayNumber(addMonths(birth, months));

    return { years: Math.floor(months / 12), months: months % 12, days };
}

export function computeTotals(birth: CivilDate, on: CivilDate): AgeTotals {
    const days = dayNumber(on) - dayNumber(birth);

    return {
        months: completedMonths(birth, on),
        weeks: Math.floor(days / 7),
        weekDays: days % 7,
        days,
    };
}

/** Orders two spans, so a limit of "30 years" can be compared with 30 years 0 months 1 day. */
export function compareSpans(a: AgeSpan, b: AgeSpan): number {
    return a.years - b.years || a.months - b.months || a.days - b.days;
}

/**
 * The first day on or after `on` that completes a year. Counted with
 * {@link computeAge} itself rather than by copying the birth day onto the
 * calendar, so a 29 February birthday lands on 1 March in a common year —
 * the day the age figure actually changes.
 */
export function nextBirthday(birth: CivilDate, on: CivilDate): NextBirthday {
    const years = computeAge(birth, on).years;
    const yesterday = addDays(on, -1);
    const yearsYesterday =
        dayNumber(yesterday) >= dayNumber(birth) ? computeAge(birth, yesterday).years : 0;

    // Today is the birthday when today is the day the figure moved — which,
    // for 29 February in a common year, is 1 March.
    if (years > yearsYesterday) {
        return { date: on, daysUntil: 0, turning: years };
    }

    const turning = years + 1;
    // The anniversary itself, or the day after it when the birth day is
    // missing from that month and the age only changes once it is over.
    let candidate = addYears(birth, turning);

    while (computeAge(birth, candidate).years < turning) {
        candidate = addDays(candidate, 1);
    }

    return { date: candidate, daysUntil: dayNumber(candidate) - dayNumber(on), turning };
}
