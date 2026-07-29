/**
 * The seven positions a cron line can carry, in the order they are written.
 * `second` and `year` only appear in the six- and seven-field dialects; the
 * parser fills them with defaults otherwise, so every downstream reader can
 * assume all seven exist.
 */
export const CRON_FIELD_NAMES = [
    "second",
    "minute",
    "hour",
    "dayOfMonth",
    "month",
    "dayOfWeek",
    "year",
] as const;

export type CronFieldName = (typeof CRON_FIELD_NAMES)[number];

/**
 * How the day-of-week column counts. Unix crontab numbers Sunday 0 and accepts
 * 7 as a second spelling of it; Quartz numbers Sunday 1 through Saturday 7. The
 * same digit means different days under the two, so it is a setting rather than
 * something to guess — `MON`, `FRI` and friends mean the same thing in both.
 */
export const CRON_WEEKDAY_BASES = ["unix", "quartz"] as const;

export type CronWeekdayBase = (typeof CRON_WEEKDAY_BASES)[number];

/** The `@`-prefixed shorthands Vixie cron accepts in place of five fields. */
export const CRON_MACROS = [
    "yearly",
    "annually",
    "monthly",
    "weekly",
    "daily",
    "midnight",
    "hourly",
    "reboot",
] as const;

export type CronMacro = (typeof CRON_MACROS)[number];

/**
 * One comma-separated term inside a field. Plain terms expand to a value set
 * up front; the four calendar-relative ones cannot, because which day they
 * name depends on the month being tested.
 */
export type CronTerm =
    /** `*` or `* /n` — every value in the field, optionally every nth. */
    | { readonly kind: "all"; readonly step: number }
    /** `5` */
    | { readonly kind: "single"; readonly value: number }
    /** `1-5`, or `1-11/2` when `step` is above one. */
    | { readonly kind: "range"; readonly from: number; readonly to: number; readonly step: number }
    /** `L` or `L-3` — the last day of the month, or that many days before it. */
    | { readonly kind: "lastDayOfMonth"; readonly offset: number }
    /** `LW` — the last Monday-to-Friday day of the month. */
    | { readonly kind: "lastWeekday" }
    /** `15W` — the weekday nearest the 15th, without crossing into another month. */
    | { readonly kind: "nearestWeekday"; readonly day: number }
    /** `5L` — the last Friday of the month. Weekday is always 0–6, Sunday first. */
    | { readonly kind: "lastWeekdayOfMonth"; readonly weekday: number }
    /** `5#3` — the third Friday of the month. */
    | { readonly kind: "nthWeekday"; readonly weekday: number; readonly nth: number };

export type CronField = {
    readonly name: CronFieldName;
    /** Exactly what was typed, for the breakdown grid. */
    readonly raw: string;
    /**
     * True when the field begins with `*`, or is Quartz's `?`. This is the flag
     * cron itself keeps, and it is what decides whether the two day fields are
     * intersected or unioned — see `dayUnion`.
     */
    readonly star: boolean;
    /** True for `?`: the field is deliberately left to the other day column. */
    readonly unspecified: boolean;
    readonly terms: readonly CronTerm[];
    /**
     * Every plain value the field matches, ascending. Calendar-relative terms
     * contribute nothing here and are tested per candidate date instead.
     */
    readonly values: readonly number[];
};

export type CronExpression = {
    readonly ok: true;
    /** The normalised source, with runs of whitespace collapsed. */
    readonly source: string;
    /** 5, 6 or 7 — the count as typed, before defaults were filled in. */
    readonly fieldCount: number;
    /** Set when the source was a macro, so the UI can name it. */
    readonly macro?: CronMacro;
    /** `@reboot` fires once at boot and never on a clock. */
    readonly reboot: boolean;
    /** True when a seconds column was typed, which changes how times read. */
    readonly hasSeconds: boolean;
    readonly weekdayBase: CronWeekdayBase;
    readonly fields: Readonly<Record<CronFieldName, CronField>>;
};

export type CronFailureReason =
    /** Nothing typed yet. */
    | "empty"
    /** Past `MAX_EXPRESSION_LENGTH`; no schedule is that long. */
    | "too_long"
    /** Not 5, 6 or 7 whitespace-separated fields. */
    | "field_count"
    /** An `@word` that is not one of the eight macros. */
    | "unknown_macro"
    /** A trailing or doubled comma left a term with nothing in it. */
    | "empty_term"
    /** The term matched no known shape. */
    | "invalid_term"
    /** Parsed, but names a number the field cannot hold. */
    | "out_of_range"
    /** `10-2` — cron ranges do not wrap around the end of the field. */
    | "reversed_range"
    /** `/0`, `/-1`, or a step with nothing after the slash. */
    | "invalid_step"
    /** `L`, `W` or `#` in a field that has no such notion. */
    | "unsupported_syntax"
    /** `#0` or `#6`; a month has at most five of any weekday. */
    | "invalid_nth";

export type CronFailure = {
    readonly ok: false;
    readonly reason: CronFailureReason;
    /** Which column was at fault, when one can be named. */
    readonly field?: CronFieldName;
    /** The offending term, echoed back so the message can quote it. */
    readonly token?: string;
};

export type ParseCronResult = CronExpression | CronFailure;

/* ------------------------------------------------------------ explanation --- */

/**
 * One entry in a field's plain-language reading. Values stay numeric: the UI
 * turns 7 into `July` or `Sunday` depending on which field it came from, in
 * the reader's own language.
 */
export type CronValueItem =
    | { readonly kind: "value"; readonly value: number }
    | { readonly kind: "range"; readonly from: number; readonly to: number }
    | { readonly kind: "step"; readonly from: number; readonly to: number; readonly step: number }
    | { readonly kind: "everyStep"; readonly step: number }
    | { readonly kind: "lastDayOfMonth"; readonly offset: number }
    | { readonly kind: "lastWeekday" }
    | { readonly kind: "nearestWeekday"; readonly day: number }
    | { readonly kind: "lastWeekdayOfMonth"; readonly weekday: number }
    | { readonly kind: "nthWeekday"; readonly weekday: number; readonly nth: number };

export type CronValuePhrase =
    | { readonly kind: "every" }
    | { readonly kind: "items"; readonly items: readonly CronValueItem[] };

/**
 * The headline clause, built from the second, minute and hour columns together
 * — `*​/5 * * * *` reads as "every 5 minutes", which no per-field description
 * would ever produce.
 */
export type CronTimePhrase =
    | { readonly kind: "everySecond" }
    | { readonly kind: "everyNSeconds"; readonly step: number }
    | { readonly kind: "everyMinute" }
    | { readonly kind: "everyNMinutes"; readonly step: number }
    | { readonly kind: "everyMinutePastHours"; readonly hours: CronValuePhrase }
    | {
          readonly kind: "everyNMinutesPastHours";
          readonly step: number;
          readonly hours: CronValuePhrase;
      }
    /** Pre-formatted `HH:mm` or `HH:mm:ss`, Western digits — these mirror a clock. */
    | { readonly kind: "atTimes"; readonly times: readonly string[] }
    | { readonly kind: "atMinutesOfEveryHour"; readonly minutes: CronValuePhrase }
    | {
          readonly kind: "atMinutesPastHours";
          readonly minutes: CronValuePhrase;
          readonly hours: CronValuePhrase;
      }
    | {
          readonly kind: "atSecondsMinutesHours";
          readonly seconds: CronValuePhrase;
          readonly minutes: CronValuePhrase;
          readonly hours: CronValuePhrase;
      };

/** A date restriction appended after the time clause, in this order. */
export type CronQualifier = {
    readonly field: "dayOfMonth" | "month" | "dayOfWeek" | "year";
    readonly phrase: CronValuePhrase;
};

export type CronExplanation = {
    readonly reboot: boolean;
    readonly time: CronTimePhrase;
    readonly qualifiers: readonly CronQualifier[];
    /**
     * True when both day columns are restricted. Cron then fires when *either*
     * matches, which surprises almost everyone the first time.
     */
    readonly dayUnion: boolean;
};

/* --------------------------------------------------------------- schedule --- */

export type CronScheduleRequest = {
    readonly expression: CronExpression;
    /** Instant to search forward from, exclusive. */
    readonly from: number;
    readonly timeZone: string;
    readonly count: number;
};

export type CronScheduleResult = {
    /** Instants in milliseconds, strictly ascending. */
    readonly runs: readonly number[];
    /** True when the search ran out of calendar before filling `count`. */
    readonly exhausted: boolean;
    /**
     * Wall clocks the schedule named that a spring-forward transition erased.
     * Reported rather than hidden — a job that silently skips a day once a year
     * is exactly the bug this tool exists to surface.
     */
    readonly skipped: number;
};

export type CronExportRequest = {
    readonly source: string;
    readonly timeZone: string;
    readonly runs: readonly number[];
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};

/** One-tap example, keyed for the message catalogue. */
export const CRON_PRESET_KEYS = [
    "everyMinute",
    "everyFiveMinutes",
    "everyFifteenMinutes",
    "hourly",
    "everyTwoHours",
    "daily",
    "weekdayMornings",
    "weekly",
    "monthly",
    "lastDayOfMonth",
    "thirdFriday",
    "yearly",
] as const;

export type CronPresetKey = (typeof CRON_PRESET_KEYS)[number];

export type CronPreset = {
    readonly key: CronPresetKey;
    readonly expression: string;
};
