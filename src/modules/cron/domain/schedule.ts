import {
    civilFromDays,
    daysFromCivil,
    getDaysInMonth,
    getWeekday,
} from "@/modules/tools/domain/calendar";
import { getZonedFields, zonedFieldsToEpochMs } from "@/modules/tools/domain/zone";
import type { CronExpression, CronField, CronScheduleRequest, CronScheduleResult } from "../types";
import { MAX_RUN_COUNT, MAX_SEARCH_STEPS, MAX_SEARCH_YEARS } from "./constants";

/**
 * When a schedule fires next, worked out on the wall clock of a named zone.
 *
 * The search never ticks second by second. It walks the columns outside in —
 * wrong year, jump a year; wrong month, jump a month — so `0 0 29 2 *` costs a
 * few dozen hops to reach the next leap day rather than two million.
 *
 * Two things separate this from arithmetic on instants, and both only show up
 * twice a year:
 *
 * - **Spring forward erases wall clocks.** `0 2 * * *` in `America/New_York`
 *   names 02:00 on a day where 02:00 never happens. Every candidate is written
 *   to an instant and read back; when the clock that comes back is not the one
 *   that went in, the occurrence is dropped and counted, because a job that
 *   silently misses a day once a year is the exact bug this tool exists to show.
 * - **Autumn back repeats them.** The hour runs twice, and a wall clock inside
 *   it maps to the earlier of the two instants — which can be *before* the
 *   instant the search started from. Those are dropped as well.
 */

/** A wall clock in the target zone, mid-search. Milliseconds never enter. */
type Cursor = {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
};

function startOfYear(year: number): Cursor {
    return { year, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
}

function startOfMonth(year: number, month: number): Cursor {
    return { year, month, day: 1, hour: 0, minute: 0, second: 0 };
}

function nextDay(cursor: Cursor): Cursor {
    const { year, month, day } = civilFromDays(
        daysFromCivil(cursor.year, cursor.month, cursor.day) + 1,
    );

    return { year, month, day, hour: 0, minute: 0, second: 0 };
}

/** The smallest allowed value at or after `current`, or `null` past the end. */
function atOrAfter(values: readonly number[], current: number): number | null {
    for (const value of values) {
        if (value >= current) {
            return value;
        }
    }

    return null;
}

/** The last Monday-to-Friday day of the month, which is what `LW` names. */
export function getLastWeekdayOfMonth(year: number, month: number): number {
    const last = getDaysInMonth(year, month);
    const weekday = getWeekday(year, month, last);

    if (weekday === 6) {
        return last - 1;
    }

    return weekday === 0 ? last - 2 : last;
}

/**
 * The weekday nearest `day`, which is what `15W` names. Quartz never lets the
 * search cross into another month, so a Saturday the 1st moves forward to the
 * 3rd rather than back to the previous month's last Friday.
 */
export function getNearestWeekday(year: number, month: number, day: number): number {
    const daysInMonth = getDaysInMonth(year, month);

    if (day > daysInMonth) {
        return -1;
    }

    const weekday = getWeekday(year, month, day);

    if (weekday >= 1 && weekday <= 5) {
        return day;
    }

    if (weekday === 6) {
        return day - 1 >= 1 ? day - 1 : day + 2;
    }

    return day + 1 <= daysInMonth ? day + 1 : day - 2;
}

function matchesDayOfMonth(field: CronField, year: number, month: number, day: number): boolean {
    if (field.values.includes(day)) {
        return true;
    }

    for (const term of field.terms) {
        switch (term.kind) {
            case "lastDayOfMonth":
                if (day === getDaysInMonth(year, month) - term.offset) {
                    return true;
                }
                break;
            case "lastWeekday":
                if (day === getLastWeekdayOfMonth(year, month)) {
                    return true;
                }
                break;
            case "nearestWeekday":
                if (day === getNearestWeekday(year, month, term.day)) {
                    return true;
                }
                break;
            default:
                break;
        }
    }

    return false;
}

function matchesDayOfWeek(field: CronField, year: number, month: number, day: number): boolean {
    const weekday = getWeekday(year, month, day);

    if (field.values.includes(weekday)) {
        return true;
    }

    for (const term of field.terms) {
        switch (term.kind) {
            case "lastWeekdayOfMonth":
                if (weekday === term.weekday && day + 7 > getDaysInMonth(year, month)) {
                    return true;
                }
                break;
            case "nthWeekday":
                if (weekday === term.weekday && Math.ceil(day / 7) === term.nth) {
                    return true;
                }
                break;
            default:
                break;
        }
    }

    return false;
}

/**
 * Cron's most surprising rule: when *both* day columns are restricted the
 * schedule fires on either, not on both. `0 0 1 * MON` is the first of the
 * month **and** every Monday. Restricted means "does not start with `*`",
 * which is the flag cron itself keeps — so `*​/2` in the day column still
 * counts as a star and still intersects.
 */
export function matchesDay(
    expression: CronExpression,
    year: number,
    month: number,
    day: number,
): boolean {
    const dayOfMonth = expression.fields.dayOfMonth;
    const dayOfWeek = expression.fields.dayOfWeek;
    const byMonth = matchesDayOfMonth(dayOfMonth, year, month, day);
    const byWeek = matchesDayOfWeek(dayOfWeek, year, month, day);

    return dayOfMonth.star || dayOfWeek.star ? byMonth && byWeek : byMonth || byWeek;
}

type Search = { readonly cursor: Cursor | null; readonly steps: number };

function findMatch(
    expression: CronExpression,
    start: Cursor,
    horizon: number,
    budget = MAX_SEARCH_STEPS,
): Search {
    const seconds = expression.fields.second.values;
    const minutes = expression.fields.minute.values;
    const hours = expression.fields.hour.values;
    const months = expression.fields.month.values;
    const years = expression.fields.year.values;

    let cursor = start;

    for (let steps = 1; steps <= budget; steps++) {
        const year = atOrAfter(years, cursor.year);

        if (year === null || year > horizon) {
            return { cursor: null, steps };
        }

        if (year !== cursor.year) {
            cursor = startOfYear(year);
            continue;
        }

        const month = atOrAfter(months, cursor.month);

        if (month === null) {
            cursor = startOfYear(cursor.year + 1);
            continue;
        }

        if (month !== cursor.month) {
            cursor = startOfMonth(cursor.year, month);
            continue;
        }

        if (!matchesDay(expression, cursor.year, cursor.month, cursor.day)) {
            cursor = nextDay(cursor);
            continue;
        }

        const hour = atOrAfter(hours, cursor.hour);

        if (hour === null) {
            cursor = nextDay(cursor);
            continue;
        }

        if (hour !== cursor.hour) {
            cursor = { ...cursor, hour, minute: 0, second: 0 };
            continue;
        }

        const minute = atOrAfter(minutes, cursor.minute);

        if (minute === null) {
            cursor =
                cursor.hour === 23
                    ? nextDay(cursor)
                    : { ...cursor, hour: cursor.hour + 1, minute: 0, second: 0 };
            continue;
        }

        if (minute !== cursor.minute) {
            cursor = { ...cursor, minute, second: 0 };
            continue;
        }

        const second = atOrAfter(seconds, cursor.second);

        if (second === null) {
            cursor =
                cursor.minute === 59
                    ? cursor.hour === 23
                        ? nextDay(cursor)
                        : { ...cursor, hour: cursor.hour + 1, minute: 0, second: 0 }
                    : { ...cursor, minute: cursor.minute + 1, second: 0 };
            continue;
        }

        if (second !== cursor.second) {
            cursor = { ...cursor, second };
            continue;
        }

        return { cursor, steps };
    }

    return { cursor: null, steps: budget };
}

function advanceOneSecond(cursor: Cursor): Cursor {
    if (cursor.second < 59) {
        return { ...cursor, second: cursor.second + 1 };
    }

    if (cursor.minute < 59) {
        return { ...cursor, minute: cursor.minute + 1, second: 0 };
    }

    return cursor.hour < 23
        ? { ...cursor, hour: cursor.hour + 1, minute: 0, second: 0 }
        : nextDay(cursor);
}

function sameClock(cursor: Cursor, timeZone: string, epochMs: number): boolean {
    const readBack = getZonedFields(epochMs, timeZone);

    return (
        readBack.year === cursor.year &&
        readBack.month === cursor.month &&
        readBack.day === cursor.day &&
        readBack.hour === cursor.hour &&
        readBack.minute === cursor.minute &&
        readBack.second === cursor.second
    );
}

export function getNextRuns(request: CronScheduleRequest): CronScheduleResult {
    const { expression, from, timeZone } = request;
    const wanted = Math.max(0, Math.min(Math.trunc(request.count), MAX_RUN_COUNT));

    if (expression.reboot || wanted === 0) {
        return { runs: [], exhausted: true, skipped: 0 };
    }

    const start = getZonedFields(from, timeZone);
    const horizon = start.year + MAX_SEARCH_YEARS;
    const runs: number[] = [];

    let cursor = advanceOneSecond({
        year: start.year,
        month: start.month,
        day: start.day,
        hour: start.hour,
        minute: start.minute,
        second: start.second,
    });
    let remaining = MAX_SEARCH_STEPS;
    let skipped = 0;

    while (runs.length < wanted && remaining > 0) {
        const found = findMatch(expression, cursor, horizon, remaining);

        remaining -= found.steps;

        if (found.cursor === null) {
            return { runs, exhausted: true, skipped };
        }

        const match = found.cursor;
        const epochMs = zonedFieldsToEpochMs({ ...match, millisecond: 0 }, timeZone);

        cursor = advanceOneSecond(match);

        if (!sameClock(match, timeZone, epochMs)) {
            skipped++;
            continue;
        }

        // An autumn overlap can map a later wall clock to an earlier instant.
        if (epochMs > from) {
            runs.push(epochMs);
        }
    }

    return { runs, exhausted: runs.length < wanted, skipped };
}
