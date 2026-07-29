import { formatOffsetLabel, getOffsetMs, getZonedFields, pad2 } from "@/modules/tools/domain/zone";

/**
 * Two kinds of string come out of here, and they follow opposite rules — the
 * same split the timestamp tool draws.
 *
 * *Machine* strings are built from integers, so they always carry Western
 * digits and a fixed grammar. They are meant to be pasted into a shell or a
 * runbook, where a Bengali numeral would be a bug.
 *
 * *Human* strings go through `Intl` with the reader's locale, so Bangla gets
 * Bengali numerals and the month name a Bangla reader expects.
 */

/** `2026-07-29 21:05:00` — the wall clock in `timeZone`, machine-readable. */
export function formatWallClock(epochMs: number, timeZone: string): string {
    const fields = getZonedFields(epochMs, timeZone);
    const date = `${String(fields.year).padStart(4, "0")}-${pad2(fields.month)}-${pad2(fields.day)}`;

    return `${date} ${pad2(fields.hour)}:${pad2(fields.minute)}:${pad2(fields.second)}`;
}

/** `2026-07-29T21:05:00+06:00` — the same instant, offset and all. */
export function formatIsoInZone(epochMs: number, timeZone: string): string {
    return `${formatWallClock(epochMs, timeZone).replace(" ", "T")}${formatOffsetLabel(
        getOffsetMs(epochMs, timeZone),
    )}`;
}

const LABEL_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function labelFormatter(locale: string, timeZone: string): Intl.DateTimeFormat {
    const key = `${locale}|${timeZone}`;
    const cached = LABEL_FORMATTERS.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const formatter = new Intl.DateTimeFormat(locale, {
        timeZone,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    });

    LABEL_FORMATTERS.set(key, formatter);

    return formatter;
}

/** `Wed, 29 Jul 2026, 21:05:00` in the reader's own language. */
export function formatRunLabel(epochMs: number, timeZone: string, locale: string): string {
    return labelFormatter(locale, timeZone).format(new Date(epochMs));
}

export type CronCountdown = {
    readonly days: number;
    readonly hours: number;
    readonly minutes: number;
    readonly seconds: number;
};

/**
 * How long until a run, broken into parts the UI can label. Locale-free on
 * purpose: `Intl.RelativeTimeFormat` only ever names one unit, and "in 1 day"
 * is the wrong answer when the question is whether a nightly job has already
 * missed its window.
 */
export function getCountdown(fromMs: number, toMs: number): CronCountdown {
    const total = Math.max(0, Math.floor((toMs - fromMs) / 1000));

    return {
        days: Math.floor(total / 86_400),
        hours: Math.floor((total % 86_400) / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: total % 60,
    };
}
