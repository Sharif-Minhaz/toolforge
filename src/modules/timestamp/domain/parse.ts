import {
    fromIsoWeekDate,
    fromOrdinalDate,
    getDaysInMonth,
    getDaysInYear,
    isValidIsoWeek,
} from "@/modules/tools/domain/calendar";
import { isKnownTimeZone } from "@/modules/tools/domain/time-zones";
import { fieldsToUtcMs, zonedFieldsToEpochMs } from "@/modules/tools/domain/zone";
import type { ZonedFields } from "@/modules/tools/types";
import type {
    DetectableEpochUnit,
    EpochUnit,
    ParseTimestampResult,
    TimestampFailure,
} from "../types";
import {
    AUTO_UNIT_THRESHOLDS,
    EPOCH_OFFSET_NANOS,
    MAX_EPOCH_MS,
    MAX_INPUT_LENGTH,
    MIN_EPOCH_MS,
    NANOS_PER_MILLISECOND,
    NANOS_PER_UNIT,
} from "./constants";

export type ParseTimestampRequest = {
    readonly input: string;
    readonly unit: EpochUnit;
    /** Supplies a zone for any input that carries none of its own. */
    readonly inputTimeZone: string;
    /** Injected so `now` is deterministic in tests. */
    readonly now: Date;
};

/* ------------------------------------------------------------- utilities --- */

function fail(
    reason: TimestampFailure["reason"],
    field?: TimestampFailure["field"],
): TimestampFailure {
    return field === undefined ? { ok: false, reason } : { ok: false, reason, field };
}

/** Narrows the `value | TimestampFailure` shape the helpers below return. */
function isFailure<T extends object>(value: T | TimestampFailure): value is TimestampFailure {
    return "ok" in value;
}

/** `bigint` division truncates toward zero; instants need it to floor. */
function floorDiv(value: bigint, divisor: bigint): bigint {
    const quotient = value / divisor;

    return value % divisor !== 0n && value < 0n !== divisor < 0n ? quotient - 1n : quotient;
}

/**
 * Splits exact nanoseconds into the millisecond instant everything else works
 * in, plus the remainder that would otherwise be lost. Keeping the remainder is
 * what lets a nanosecond input come back out as the same nanosecond value.
 */
function fromEpochNanos(
    epochNanos: bigint,
): { readonly epochMs: number; readonly subMilliNanos: number } | TimestampFailure {
    const epochMs = floorDiv(epochNanos, NANOS_PER_MILLISECOND);

    if (epochMs < BigInt(MIN_EPOCH_MS) || epochMs > BigInt(MAX_EPOCH_MS)) {
        return fail("out_of_range");
    }

    return {
        epochMs: Number(epochMs),
        subMilliNanos: Number(epochNanos - epochMs * NANOS_PER_MILLISECOND),
    };
}

function withinRange(epochMs: number): boolean {
    return Number.isFinite(epochMs) && epochMs >= MIN_EPOCH_MS && epochMs <= MAX_EPOCH_MS;
}

/* ------------------------------------------------------- numeric epochs --- */

const NUMERIC_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/**
 * Reads the magnitude and picks the scale it must have been written at. Each
 * boundary is a thousand times the last, so a value can only sit in one band:
 * 1e11 seconds is the year 5138, while 1e11 milliseconds is 1973.
 */
export function detectEpochUnit(magnitude: bigint): DetectableEpochUnit {
    if (magnitude < AUTO_UNIT_THRESHOLDS.seconds) {
        return "seconds";
    }

    if (magnitude < AUTO_UNIT_THRESHOLDS.milliseconds) {
        return "milliseconds";
    }

    if (magnitude < AUTO_UNIT_THRESHOLDS.microseconds) {
        return "microseconds";
    }

    return "nanoseconds";
}

/** Scales `<integer>.<fraction>` by `multiplier` without ever leaving exact integers. */
function scaleDecimal(integer: string, fraction: string, multiplier: bigint): bigint {
    if (fraction.length === 0) {
        return BigInt(integer) * multiplier;
    }

    return (BigInt(integer + fraction) * multiplier) / 10n ** BigInt(fraction.length);
}

function parseNumeric(input: string, unit: EpochUnit): ParseTimestampResult | null {
    const match = NUMERIC_PATTERN.exec(input);

    if (match === null) {
        return null;
    }

    const [, sign, integer, fraction = ""] = match;
    const magnitude = BigInt(integer);
    const resolved = unit === "auto" ? detectEpochUnit(magnitude) : unit;
    const scaled = scaleDecimal(integer, fraction, NANOS_PER_UNIT[resolved]);
    const signed = sign === "-" ? -scaled : scaled;
    const instant = fromEpochNanos(signed + EPOCH_OFFSET_NANOS[resolved]);

    if (isFailure(instant)) {
        return instant;
    }

    return {
        ok: true,
        epochMs: instant.epochMs,
        kind: "epoch",
        unit: resolved,
        usedInputZone: false,
        subMilliNanos: instant.subMilliNanos,
    };
}

/* ------------------------------------------------------------ id formats --- */

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const UUID_PATTERN =
    /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i;

/**
 * 100-nanosecond intervals between the Gregorian reform (1582-10-15) and the
 * unix epoch, which is where RFC 9562 starts counting for versions 1 and 6.
 */
const GREGORIAN_OFFSET_100NS = 122_192_928_000_000_000n;

function parseObjectId(input: string): ParseTimestampResult | null {
    if (!OBJECT_ID_PATTERN.test(input)) {
        return null;
    }

    // The leading four bytes of an ObjectId are the creation time in seconds.
    const seconds = Number.parseInt(input.slice(0, 8), 16);

    return {
        ok: true,
        epochMs: seconds * 1000,
        kind: "objectId",
        usedInputZone: false,
        subMilliNanos: 0,
    };
}

function parseUuid(input: string): ParseTimestampResult | null {
    const match = UUID_PATTERN.exec(input);

    if (match === null) {
        return null;
    }

    const [, timeLow, timeMid, timeHigh] = match;
    const version = Number.parseInt(timeHigh[0], 16);

    if (version === 7) {
        // A v7 id opens with 48 bits of unix milliseconds.
        const epochMs = Number(BigInt(`0x${timeLow}${timeMid}`));

        return withinRange(epochMs)
            ? { ok: true, epochMs, kind: "uuid", usedInputZone: false, subMilliNanos: 0 }
            : fail("out_of_range");
    }

    if (version !== 1 && version !== 6) {
        // Versions 3, 4, 5 and 8 hold no time at all.
        return fail("unrecognized");
    }

    // v1 scatters the timestamp low-to-high; v6 stores it in reading order.
    const gregorian100ns =
        version === 1
            ? (BigInt(`0x${timeHigh}`) & 0x0fffn) * 0x1_0000_0000_0000n +
              BigInt(`0x${timeMid}`) * 0x1_0000_0000n +
              BigInt(`0x${timeLow}`)
            : BigInt(`0x${timeLow}`) * 0x1000_0000n +
              BigInt(`0x${timeMid}`) * 0x1000n +
              (BigInt(`0x${timeHigh}`) & 0x0fffn);

    const instant = fromEpochNanos((gregorian100ns - GREGORIAN_OFFSET_100NS) * 100n);

    if (isFailure(instant)) {
        return instant;
    }

    return {
        ok: true,
        epochMs: instant.epochMs,
        kind: "uuid",
        usedInputZone: false,
        subMilliNanos: instant.subMilliNanos,
    };
}

/* --------------------------------------------------------------- ISO 8601 --- */

/** `2026-07-29`, `2026-07`, `2026-210`, `2026-W31-3`, each optionally with a time. */
const ISO_EXTENDED_PATTERN =
    /^([+-]\d{6}|\d{4})-(?:W(\d{2})(?:-(\d))?|(\d{3})|(\d{2})(?:-(\d{2}))?)(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** `20260729T120000Z` — the basic format, which needs the `T` to stay unambiguous. */
const ISO_BASIC_PATTERN =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?:(\d{2}))?(?:[.,](\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

const OFFSET_PATTERN = /^([+-])(\d{1,2})(?::?(\d{2}))?$/;

/** Minutes east of UTC, or `null` when the token is not an offset. */
function readOffsetMinutes(token: string): number | null {
    if (token.toUpperCase() === "Z") {
        return 0;
    }

    const match = OFFSET_PATTERN.exec(token);

    if (match === null) {
        return null;
    }

    const [, sign, hours, minutes = "00"] = match;
    const total = Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10);

    return sign === "-" ? -total : total;
}

/** Pads or trims a fractional-second string to exactly nine digits of nanoseconds. */
function fractionToNanos(fraction: string | undefined): number {
    if (fraction === undefined) {
        return 0;
    }

    return Number.parseInt(fraction.padEnd(9, "0").slice(0, 9), 10);
}

type TimeParts = {
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly nanos: number;
};

function validateFields(
    year: number,
    month: number,
    day: number,
    time: TimeParts,
): TimestampFailure | null {
    if (month < 1 || month > 12) {
        return fail("invalid_component", "month");
    }

    if (day < 1 || day > getDaysInMonth(year, month)) {
        return fail("invalid_component", "day");
    }

    if (time.hour > 23) {
        return fail("invalid_component", "hour");
    }

    if (time.minute > 59) {
        return fail("invalid_component", "minute");
    }

    // 60 is a leap second; `Date` rolls it into the following minute, which is
    // the only sensible thing to do without a leap-second table.
    if (time.second > 60) {
        return fail("invalid_component", "second");
    }

    return null;
}

/**
 * Turns validated fields plus an optional offset into an instant.
 *
 * When the input named its own offset the answer is pure arithmetic. When it
 * did not, the configured input zone supplies one — which is the whole reason
 * this module never calls `new Date(string)`: the engine would silently use the
 * *host's* zone, so a server render and a browser render of the same link would
 * disagree.
 */
function assemble(
    year: number,
    month: number,
    day: number,
    time: TimeParts,
    offsetMinutes: number | null,
    inputTimeZone: string,
    kind: "iso8601" | "rfc2822" | "dateString",
): ParseTimestampResult {
    const invalid = validateFields(year, month, day, time);

    if (invalid !== null) {
        return invalid;
    }

    const fields: ZonedFields = {
        year,
        month,
        day,
        hour: time.hour,
        minute: time.minute,
        second: time.second,
        millisecond: Math.floor(time.nanos / 1_000_000),
    };

    const epochMs =
        offsetMinutes === null
            ? zonedFieldsToEpochMs(fields, inputTimeZone)
            : fieldsToUtcMs(fields) - offsetMinutes * 60_000;

    if (!withinRange(epochMs)) {
        return fail("out_of_range");
    }

    return {
        ok: true,
        epochMs,
        kind,
        usedInputZone: offsetMinutes === null,
        subMilliNanos: time.nanos % 1_000_000,
    };
}

function parseIso(input: string, inputTimeZone: string): ParseTimestampResult | null {
    const basic = ISO_BASIC_PATTERN.exec(input);

    if (basic !== null) {
        const [, year, month, day, hour, minute, second = "0", fraction, offset] = basic;

        return assemble(
            Number.parseInt(year, 10),
            Number.parseInt(month, 10),
            Number.parseInt(day, 10),
            {
                hour: Number.parseInt(hour, 10),
                minute: Number.parseInt(minute, 10),
                second: Number.parseInt(second, 10),
                nanos: fractionToNanos(fraction),
            },
            offset === undefined ? null : readOffsetMinutes(offset),
            inputTimeZone,
            "iso8601",
        );
    }

    const extended = ISO_EXTENDED_PATTERN.exec(input);

    if (extended === null) {
        return null;
    }

    const [
        ,
        yearText,
        weekText,
        weekdayText,
        ordinalText,
        monthText,
        dayText,
        hourText,
        minuteText,
        secondText = "0",
        fraction,
        offsetText,
    ] = extended;

    const year = Number.parseInt(yearText, 10);
    const time: TimeParts = {
        hour: hourText === undefined ? 0 : Number.parseInt(hourText, 10),
        minute: minuteText === undefined ? 0 : Number.parseInt(minuteText, 10),
        second: Number.parseInt(secondText, 10),
        nanos: fractionToNanos(fraction),
    };
    const offsetMinutes = offsetText === undefined ? null : readOffsetMinutes(offsetText);

    if (weekText !== undefined) {
        const week = Number.parseInt(weekText, 10);

        if (!isValidIsoWeek(year, week)) {
            return fail("invalid_component", "day");
        }

        const weekday = weekdayText === undefined ? 1 : Number.parseInt(weekdayText, 10);

        if (weekday < 1 || weekday > 7) {
            return fail("invalid_component", "day");
        }

        const civil = fromIsoWeekDate(year, week, weekday);

        return assemble(
            civil.year,
            civil.month,
            civil.day,
            time,
            offsetMinutes,
            inputTimeZone,
            "iso8601",
        );
    }

    if (ordinalText !== undefined) {
        const ordinal = Number.parseInt(ordinalText, 10);

        if (ordinal < 1 || ordinal > getDaysInYear(year)) {
            return fail("invalid_component", "day");
        }

        const civil = fromOrdinalDate(year, ordinal);

        return assemble(
            year,
            civil.month,
            civil.day,
            time,
            offsetMinutes,
            inputTimeZone,
            "iso8601",
        );
    }

    return assemble(
        year,
        Number.parseInt(monthText, 10),
        dayText === undefined ? 1 : Number.parseInt(dayText, 10),
        time,
        offsetMinutes,
        inputTimeZone,
        "iso8601",
    );
}

/* ------------------------------------------------------------ token soup --- */

const MONTHS: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

const WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/**
 * The alphabetic zones RFC 2822 §4.3 still defines. Every other abbreviation is
 * ambiguous — IST alone means three different offsets — so an unrecognised one
 * is treated as "no zone given" and the configured input zone takes over.
 */
const RFC_ZONE_MINUTES: Record<string, number> = {
    ut: 0,
    utc: 0,
    gmt: 0,
    z: 0,
    est: -300,
    edt: -240,
    cst: -360,
    cdt: -300,
    mst: -420,
    mdt: -360,
    pst: -480,
    pdt: -420,
};

/** Connective words a person writes and a parser can drop. */
const FILLER = new Set(["at", "on", "of", "the"]);

const TIME_TOKEN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,9}))?$/;
const ORDINAL_DAY = /^(\d{1,2})(?:st|nd|rd|th)$/;
const ZONE_PREFIXED_OFFSET = /^(?:gmt|utc|ut)([+-]\d{1,2}(?::?\d{2})?)$/;
const NUMERIC_TRIPLE = /^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/;

type Accumulator = {
    year?: number;
    month?: number;
    day?: number;
    time?: TimeParts;
    meridiem?: "am" | "pm";
    offsetMinutes?: number;
    /** Plain numbers whose role is decided once every token has been seen. */
    loose: number[];
};

/** Resolves `07/29/2026` vs `29/07/2026` by which field cannot be a month. */
function readNumericTriple(
    first: number,
    second: number,
    third: number,
    firstWidth: number,
    thirdWidth: number,
): { year: number; month: number; day: number } | TimestampFailure {
    if (firstWidth === 4) {
        return { year: first, month: second, day: third };
    }

    if (thirdWidth !== 4) {
        return fail("unrecognized");
    }

    if (first > 12) {
        return { year: third, month: second, day: first };
    }

    if (second > 12) {
        return { year: third, month: first, day: second };
    }

    // Both could be a month. Guessing here is how a tool quietly tells someone
    // their deploy happened five weeks from when it did.
    return fail("ambiguous_date");
}

function classify(token: string, accumulator: Accumulator): TimestampFailure | null {
    const lower = token.toLowerCase();

    if (lower.length === 0 || FILLER.has(lower)) {
        return null;
    }

    if (WEEKDAYS.has(lower.slice(0, 3)) && !/\d/.test(lower)) {
        // A weekday name is redundant with the date, and disagreeing with it is
        // not worth rejecting the input over.
        return null;
    }

    if (lower === "am" || lower === "pm") {
        accumulator.meridiem = lower;

        return null;
    }

    const timeMatch = TIME_TOKEN.exec(lower);

    if (timeMatch !== null) {
        const [, hour, minute, second = "0", fraction] = timeMatch;

        accumulator.time = {
            hour: Number.parseInt(hour, 10),
            minute: Number.parseInt(minute, 10),
            second: Number.parseInt(second, 10),
            nanos: fractionToNanos(fraction),
        };

        return null;
    }

    const triple = NUMERIC_TRIPLE.exec(lower);

    if (triple !== null) {
        const [, first, second, third] = triple;
        const resolved = readNumericTriple(
            Number.parseInt(first, 10),
            Number.parseInt(second, 10),
            Number.parseInt(third, 10),
            first.length,
            third.length,
        );

        if (isFailure(resolved)) {
            return resolved;
        }

        accumulator.year = resolved.year;
        accumulator.month = resolved.month;
        accumulator.day = resolved.day;

        return null;
    }

    if (lower in RFC_ZONE_MINUTES) {
        accumulator.offsetMinutes = RFC_ZONE_MINUTES[lower];

        return null;
    }

    const prefixed = ZONE_PREFIXED_OFFSET.exec(lower);
    const offset = readOffsetMinutes(prefixed === null ? token : prefixed[1]);

    if (offset !== null) {
        accumulator.offsetMinutes = offset;

        return null;
    }

    const month = MONTHS[lower.slice(0, 3)];

    if (month !== undefined && !/\d/.test(lower)) {
        accumulator.month = month;

        return null;
    }

    const ordinal = ORDINAL_DAY.exec(lower);

    if (ordinal !== null) {
        accumulator.day = Number.parseInt(ordinal[1], 10);

        return null;
    }

    if (/^\d{1,6}$/.test(lower)) {
        accumulator.loose.push(Number.parseInt(lower, 10));

        return null;
    }

    // An alphabetic run that reached here is a zone abbreviation this parser
    // will not guess at — `IST` is three different offsets. Falling through to
    // the input zone beats picking one of them.
    if (/^[a-z]{2,5}$/.test(lower)) {
        return null;
    }

    return fail("unrecognized");
}

/** Decides which of the leftover plain numbers is the year and which the day. */
function placeLooseNumbers(accumulator: Accumulator): TimestampFailure | null {
    for (const value of accumulator.loose) {
        if (accumulator.year === undefined && value >= 100) {
            accumulator.year = value;
            continue;
        }

        if (accumulator.day === undefined && value >= 1 && value <= 31) {
            accumulator.day = value;
            continue;
        }

        if (accumulator.year === undefined) {
            accumulator.year = value;
            continue;
        }

        return fail("unrecognized");
    }

    return null;
}

function applyMeridiem(
    time: TimeParts,
    meridiem: "am" | "pm" | undefined,
): TimeParts | TimestampFailure {
    if (meridiem === undefined) {
        return time;
    }

    if (time.hour < 1 || time.hour > 12) {
        return fail("invalid_component", "hour");
    }

    const hour = meridiem === "pm" ? (time.hour % 12) + 12 : time.hour % 12;

    return { ...time, hour };
}

const MIDNIGHT: TimeParts = { hour: 0, minute: 0, second: 0, nanos: 0 };

/**
 * The fallback reader: RFC 2822, HTTP dates, `Date.prototype.toString()`, and
 * the ways people write dates by hand. Each token is classified on its own and
 * the pieces are assembled afterwards, which is what lets one function cover
 * `Wed, 29 Jul 2026 12:00:00 GMT`, `July 29, 2026 6:00 PM` and
 * `Wed Jul 29 2026 12:00:00 GMT+0600` without a regex for each.
 */
function parseDateText(input: string, inputTimeZone: string): ParseTimestampResult {
    // A trailing `(Bangladesh Standard Time)` is decoration on an offset that
    // has already been given.
    const cleaned = input.replaceAll(/\([^)]*\)/g, " ");
    const accumulator: Accumulator = { loose: [] };

    for (const token of cleaned.split(/[\s,]+/)) {
        const failure = classify(token, accumulator);

        if (failure !== null) {
            return failure;
        }
    }

    const looseFailure = placeLooseNumbers(accumulator);

    if (looseFailure !== null) {
        return looseFailure;
    }

    const { year, month, day } = accumulator;

    if (year === undefined || month === undefined || day === undefined) {
        return fail("unrecognized");
    }

    const time = applyMeridiem(accumulator.time ?? MIDNIGHT, accumulator.meridiem);

    if (isFailure(time)) {
        return time;
    }

    // A clock time *and* an explicit zone is what separates an RFC 2822 or HTTP
    // date from a date somebody typed; anything looser is reported as plain
    // date text so the reading is never overstated.
    const rfcShaped = accumulator.time !== undefined && accumulator.offsetMinutes !== undefined;

    return assemble(
        year,
        month,
        day,
        time,
        accumulator.offsetMinutes ?? null,
        inputTimeZone,
        rfcShaped ? "rfc2822" : "dateString",
    );
}

/* ------------------------------------------------------------ entry point --- */

/**
 * The one reader the page and the island both call. Pure and deterministic
 * given `now`, so the server-rendered first paint already holds the answer.
 */
export function parseTimestamp(request: ParseTimestampRequest): ParseTimestampResult {
    const input = request.input.trim();

    if (input.length === 0) {
        return fail("empty");
    }

    if (input.length > MAX_INPUT_LENGTH) {
        return fail("too_long");
    }

    if (!isKnownTimeZone(request.inputTimeZone)) {
        return fail("unknown_time_zone");
    }

    if (input.toLowerCase() === "now") {
        return {
            ok: true,
            epochMs: request.now.getTime(),
            kind: "now",
            usedInputZone: false,
            subMilliNanos: 0,
        };
    }

    // Ids go first, and cannot collide with a number: 24 and 32 digit values
    // are past every epoch scale's range, so nothing that reaches `parseNumeric`
    // was ever a viable ObjectId or UUID.
    return (
        parseUuid(input) ??
        parseObjectId(input) ??
        parseNumeric(input, request.unit) ??
        parseIso(input, request.inputTimeZone) ??
        parseDateText(input, request.inputTimeZone)
    );
}
