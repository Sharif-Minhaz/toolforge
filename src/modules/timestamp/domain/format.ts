import { getIsoDayOfWeek } from "@/modules/tools/domain/calendar";
import {
    formatOffsetLabel,
    formatRfcOffset,
    getOffsetMs,
    getZonedFields,
    isInDaylightTime,
    pad2,
} from "@/modules/tools/domain/zone";
import type { EpochRendering, ZonedRendering } from "../types";
import { NANOS_PER_MILLISECOND } from "./constants";

/**
 * Two kinds of string come out of here and they follow opposite rules.
 *
 * *Machine* formats — the epoch scales, ISO 8601, RFC 2822 — are built by hand
 * from integers so they always carry Western digits and a fixed grammar. They
 * are meant to be pasted into a shell or a config file, and a Bengali numeral
 * there is a bug.
 *
 * *Human* formats go through `Intl` with the reader's locale, so Bangla renders
 * Bengali numerals and the month name a Bangla reader expects.
 */

/* ----------------------------------------------------------------- epochs --- */

function floorDiv(value: bigint, divisor: bigint): bigint {
    const quotient = value / divisor;

    return value % divisor !== 0n && value < 0n !== divisor < 0n ? quotient - 1n : quotient;
}

/**
 * Every unix scale for one instant, as exact decimal strings. `bigint`
 * throughout because a nanosecond timestamp has nineteen digits and `number`
 * starts rounding at sixteen.
 */
export function renderEpochs(epochMs: number, subMilliNanos: number): EpochRendering {
    const nanos = BigInt(epochMs) * NANOS_PER_MILLISECOND + BigInt(subMilliNanos);

    return {
        seconds: floorDiv(nanos, 1_000_000_000n).toString(),
        milliseconds: floorDiv(nanos, NANOS_PER_MILLISECOND).toString(),
        microseconds: floorDiv(nanos, 1_000n).toString(),
        nanoseconds: nanos.toString(),
    };
}

/* -------------------------------------------------------- machine strings --- */

/**
 * ISO 8601 needs four digits, and the expanded `±YYYYYY` form outside
 * 0000–9999. A year that just gets stringified silently produces `-1-07-29`,
 * which no parser will take back.
 */
function formatIsoYear(year: number): string {
    if (year >= 0 && year <= 9999) {
        return String(year).padStart(4, "0");
    }

    const sign = year < 0 ? "-" : "+";

    return `${sign}${String(Math.abs(year)).padStart(6, "0")}`;
}

const RFC_MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

const RFC_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ------------------------------------------------------------ Intl caches --- */

type IntlShape = "full" | "date" | "time" | "weekday" | "shortOffset" | "abbreviation" | "zoneName";

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

const OPTIONS: Record<IntlShape, Intl.DateTimeFormatOptions> = {
    full: { dateStyle: "full", timeStyle: "medium" },
    date: { dateStyle: "full" },
    time: { timeStyle: "medium" },
    weekday: { weekday: "long" },
    shortOffset: { timeZoneName: "shortOffset" },
    abbreviation: { timeZoneName: "short" },
    zoneName: { timeZoneName: "longGeneric" },
};

function formatter(locale: string, timeZone: string, shape: IntlShape): Intl.DateTimeFormat {
    const key = `${locale}|${timeZone}|${shape}`;
    const cached = FORMATTERS.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const built = new Intl.DateTimeFormat(locale, { timeZone, ...OPTIONS[shape] });

    FORMATTERS.set(key, built);

    return built;
}

/** The zone-name shapes render as one part among several; this pulls it out. */
function zonePart(locale: string, timeZone: string, shape: IntlShape, epochMs: number): string {
    const parts = formatter(locale, timeZone, shape).formatToParts(new Date(epochMs));

    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
}

/* -------------------------------------------------------------- rendering --- */

/**
 * One instant, told in one zone, every way a reader might need it.
 *
 * `locale` arrives as a plain string rather than through `next-intl`, which is
 * what keeps this file in `domain/`.
 */
export function renderZone(epochMs: number, timeZone: string, locale: string): ZonedRendering {
    const fields = getZonedFields(epochMs, timeZone);
    const offsetMs = getOffsetMs(epochMs, timeZone);
    const date = new Date(epochMs);

    const clock = `${pad2(fields.hour)}:${pad2(fields.minute)}:${pad2(fields.second)}`;
    const fraction =
        fields.millisecond === 0 ? "" : `.${String(fields.millisecond).padStart(3, "0")}`;
    const civil = `${formatIsoYear(fields.year)}-${pad2(fields.month)}-${pad2(fields.day)}`;

    // RFC 2822 spells the weekday in English regardless of locale, and takes it
    // from the date rather than from `Intl`. ISO numbers Monday 1; this array
    // starts at Sunday, which `% 7` lines up.
    const weekday = RFC_WEEKDAYS[getIsoDayOfWeek(fields.year, fields.month, fields.day) % 7];

    return {
        timeZone,
        offsetMinutes: offsetMs / 60_000,
        offsetLabel: formatOffsetLabel(offsetMs),
        shortOffset: zonePart(locale, timeZone, "shortOffset", epochMs),
        abbreviation: zonePart(locale, timeZone, "abbreviation", epochMs),
        zoneName: zonePart(locale, timeZone, "zoneName", epochMs),
        fullDate: formatter(locale, timeZone, "full").format(date),
        dateOnly: formatter(locale, timeZone, "date").format(date),
        timeOnly: formatter(locale, timeZone, "time").format(date),
        weekday: formatter(locale, timeZone, "weekday").format(date),
        iso8601: `${civil}T${clock}${fraction}${formatOffsetLabel(offsetMs)}`,
        rfc2822: `${weekday}, ${pad2(fields.day)} ${RFC_MONTHS[fields.month - 1]} ${formatIsoYear(fields.year)} ${clock} ${formatRfcOffset(offsetMs)}`,
        inDaylightTime: isInDaylightTime(epochMs, timeZone),
    };
}

/* --------------------------------------------------------------- relative --- */

const RELATIVE_STEPS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
    ["year", 365 * 86_400_000],
    ["month", 30 * 86_400_000],
    ["week", 7 * 86_400_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1000],
];

const RELATIVE_FORMATTERS = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
    const cached = RELATIVE_FORMATTERS.get(locale);

    if (cached !== undefined) {
        return cached;
    }

    const built = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

    RELATIVE_FORMATTERS.set(locale, built);

    return built;
}

/**
 * "3 hours ago", "in 2 days" — the largest unit that still reads as more than
 * one. Approximate by design: a calendar-exact difference would have to pick a
 * zone, and this line sits above the per-zone cards.
 */
export function renderRelative(epochMs: number, nowMs: number, locale: string): string {
    const difference = epochMs - nowMs;

    for (const [unit, size] of RELATIVE_STEPS) {
        if (Math.abs(difference) >= size) {
            return relativeFormatter(locale).format(Math.trunc(difference / size), unit);
        }
    }

    return relativeFormatter(locale).format(0, "second");
}
