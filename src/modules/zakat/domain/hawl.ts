import { civilFromDays, daysFromCivil } from "@/modules/tools/domain/calendar";
import { fromHijriDate, getHijriMonthLength, toHijriDate } from "@/modules/tools/domain/hijri";
import type { CivilDate, HijriDate } from "@/modules/tools/types";

/**
 * The zakat year (hawl): a full lunar year from the day wealth first reached
 * nisab, and the same Hijri date every year after.
 *
 * Hijri, not Gregorian, because the rate is for a lunar year — a Gregorian
 * anniversary arrives eleven days late each year and loses a whole zakat year
 * every thirty-three (Dar al-Ifta Egypt, fatwa 8124). The Hijri day is the
 * tabular calendar's, moved by `adjustment` days for a local moon sighting,
 * the same correction the Age Calculator offers; the page says so beside it.
 *
 * A 30th that a later month does not have falls on that month's 29th.
 */

/** Anniversaries listed, and written into the reminder file. */
export const HAWL_ANNIVERSARIES = 5;

export type HawlAnniversary = {
    readonly gregorian: CivilDate;
    readonly hijri: HijriDate;
    /** Days from today; 0 is today. */
    readonly daysAway: number;
};

export type HawlPlan =
    | {
          readonly ok: true;
          readonly startHijri: HijriDate;
          /** Lunar years completed since the start, as of today. */
          readonly yearsCompleted: number;
          readonly upcoming: readonly HawlAnniversary[];
      }
    | { readonly ok: false; readonly reason: "start_in_future" | "invalid_date" };

function dayNumber(date: CivilDate): number {
    return daysFromCivil(date.year, date.month, date.day);
}

function anniversary(start: HijriDate, year: number, adjustment: number): CivilDate | null {
    const day = Math.min(start.day, getHijriMonthLength(year, start.month));

    return fromHijriDate(year, start.month, day, adjustment);
}

export function planHawl(start: CivilDate, today: CivilDate, adjustment = 0): HawlPlan {
    const startDay = dayNumber(start);
    const todayDay = dayNumber(today);
    const roundTrip = civilFromDays(startDay);

    if (
        roundTrip.year !== start.year ||
        roundTrip.month !== start.month ||
        roundTrip.day !== start.day
    ) {
        return { ok: false, reason: "invalid_date" };
    }

    if (startDay > todayDay) {
        return { ok: false, reason: "start_in_future" };
    }

    const startHijri = toHijriDate(start, adjustment);
    const upcoming: HawlAnniversary[] = [];
    let yearsCompleted = 0;

    for (let year = startHijri.year + 1; upcoming.length < HAWL_ANNIVERSARIES; year += 1) {
        const date = anniversary(startHijri, year, adjustment);

        if (date === null) {
            continue;
        }

        const away = dayNumber(date) - todayDay;

        if (away < 0) {
            yearsCompleted += 1;
            continue;
        }

        upcoming.push({ gregorian: date, hijri: toHijriDate(date, adjustment), daysAway: away });
    }

    return { ok: true, startHijri, yearsCompleted, upcoming };
}

// --- the reminder file --------------------------------------------------

/** RFC 5545 §3.3.11: backslash, semicolon and comma are escaped; a newline becomes `\n`. */
function escapeText(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\;")
        .replace(/,/g, "\\,")
        .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF and a
 * space. Counted in UTF-8 bytes and never split inside a character — Bangla is
 * three bytes a letter, and a fold through one would corrupt it.
 */
function fold(line: string): string {
    const encoder = new TextEncoder();
    const parts: string[] = [];
    let current = "";
    let bytes = 0;
    let limit = 75;

    for (const char of line) {
        const size = encoder.encode(char).length;

        if (bytes + size > limit) {
            parts.push(current);
            current = "";
            bytes = 0;
            // Continuation lines begin with the space, which counts.
            limit = 74;
        }

        current += char;
        bytes += size;
    }

    parts.push(current);

    return parts.join("\r\n ");
}

const pad = (value: number) => String(value).padStart(2, "0");

function icsDate(date: CivilDate): string {
    return `${String(date.year).padStart(4, "0")}${pad(date.month)}${pad(date.day)}`;
}

function icsStamp(epochMs: number): string {
    const iso = new Date(epochMs).toISOString();

    return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

export type ReminderText = {
    readonly summary: string;
    readonly description: string;
    readonly alarm: string;
};

/**
 * One all-day event per anniversary, each with an alarm a week before, so the
 * money can be gathered — not one recurring event, which a calendar would
 * repeat on the Gregorian date and drift off the Hijri one.
 *
 * `stampMs` (the file's creation time) and `uidSeed` are passed in: the
 * domain never reads the clock or draws randomness.
 */
export function buildHawlCalendar(
    anniversaries: readonly HawlAnniversary[],
    text: ReminderText,
    stampMs: number,
    uidSeed: string,
): string {
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ToolForge//Zakat Calculator//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ];

    for (const entry of anniversaries) {
        const next = civilFromDays(dayNumber(entry.gregorian) + 1);

        lines.push(
            "BEGIN:VEVENT",
            `UID:zakat-${uidSeed}-${icsDate(entry.gregorian)}@toolforge`,
            `DTSTAMP:${icsStamp(stampMs)}`,
            `DTSTART;VALUE=DATE:${icsDate(entry.gregorian)}`,
            `DTEND;VALUE=DATE:${icsDate(next)}`,
            `SUMMARY:${escapeText(text.summary)}`,
            `DESCRIPTION:${escapeText(text.description)}`,
            "TRANSP:TRANSPARENT",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            `DESCRIPTION:${escapeText(text.alarm)}`,
            "TRIGGER:-P7D",
            "END:VALARM",
            "END:VEVENT",
        );
    }

    lines.push("END:VCALENDAR");

    return `${lines.map(fold).join("\r\n")}\r\n`;
}
