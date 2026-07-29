import type { CronFieldName, CronMacro, CronPreset, CronWeekdayBase } from "../types";

/** Long enough for a seven-field line with named lists, short enough to bound the parse. */
export const MAX_EXPRESSION_LENGTH = 200;

export const DEFAULT_RUN_COUNT = 5;
export const MIN_RUN_COUNT = 1;
export const MAX_RUN_COUNT = 25;

/** One-tap counts: a glance, the default, a shift, and a full ceiling. */
export const RUN_COUNT_PRESETS: readonly number[] = [3, 5, 10, 25];

/**
 * How far ahead the scheduler is willing to look. A year column can name a
 * decade that never arrives, and `0 0 30 2 *` never arrives at all — both have
 * to stop somewhere rather than walking the calendar forever.
 */
export const MAX_SEARCH_YEARS = 100;

/**
 * Ceiling on wall-clock hops per run. The walk skips whole months and days
 * rather than ticking, so a real expression needs a few hundred at most; this
 * only catches a schedule nothing can satisfy.
 */
export const MAX_SEARCH_STEPS = 20_000;

/** Beyond this, "at 00:05, 00:20, 01:05, …" stops being a sentence and the
 *  reading falls back to describing the two columns separately. */
export const MAX_LISTED_TIMES = 8;

/**
 * Cron itself has no zone. A crontab fires on the machine's clock, and the
 * machine is far more often UTC than it is the reader's own zone — so the
 * default answers "when does this fire on the server", not "when does it fire
 * where I am sitting".
 */
export const DEFAULT_TIME_ZONE = "UTC";

export const DEFAULT_WEEKDAY_BASE: CronWeekdayBase = "unix";

export const DEFAULT_EXPRESSION = "*/5 * * * *";

/** Inclusive bounds per field. Day-of-week is widened to 0–7 by the parser
 *  under the unix base, where 7 is a second spelling of Sunday. */
export const FIELD_RANGES: Readonly<Record<CronFieldName, { min: number; max: number }>> = {
    second: { min: 0, max: 59 },
    minute: { min: 0, max: 59 },
    hour: { min: 0, max: 23 },
    dayOfMonth: { min: 1, max: 31 },
    month: { min: 1, max: 12 },
    dayOfWeek: { min: 0, max: 6 },
    year: { min: 1970, max: 2199 },
};

/** Three-letter names, as crontab spells them. Data, not copy. */
export const MONTH_NAMES: readonly string[] = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
];

export const WEEKDAY_NAMES: readonly string[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * What each macro expands to. `@reboot` has no expansion — it is not a clock
 * schedule at all — and is handled separately.
 */
export const MACRO_EXPANSIONS: Readonly<Record<Exclude<CronMacro, "reboot">, string>> = {
    yearly: "0 0 1 1 *",
    annually: "0 0 1 1 *",
    monthly: "0 0 1 * *",
    weekly: "0 0 * * 0",
    daily: "0 0 * * *",
    midnight: "0 0 * * *",
    hourly: "0 * * * *",
};

/**
 * One-tap examples, ordered from the most common upward. The last three exist
 * to show the calendar-relative syntax, which is the part nobody remembers.
 */
export const CRON_PRESETS: readonly CronPreset[] = [
    { key: "everyMinute", expression: "* * * * *" },
    { key: "everyFiveMinutes", expression: "*/5 * * * *" },
    { key: "everyFifteenMinutes", expression: "*/15 * * * *" },
    { key: "hourly", expression: "0 * * * *" },
    { key: "everyTwoHours", expression: "0 */2 * * *" },
    { key: "daily", expression: "0 0 * * *" },
    { key: "weekdayMornings", expression: "0 9 * * MON-FRI" },
    { key: "weekly", expression: "0 0 * * SUN" },
    { key: "monthly", expression: "0 0 1 * *" },
    { key: "lastDayOfMonth", expression: "0 23 L * *" },
    { key: "thirdFriday", expression: "0 8 * * FRI#3" },
    { key: "yearly", expression: "0 0 1 1 *" },
];
