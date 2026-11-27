import { westernDigit } from "@/modules/tools/domain/bangla-digits";
import { daysFromCivil, getDaysInMonth } from "@/modules/tools/domain/calendar";
import type { CivilDate, DateInputResult } from "../types";
import { MAX_YEAR, MIN_YEAR } from "./constants";

/**
 * Reading a typed date. Day first, the way Bangladesh writes one — `12/05/1998`
 * is the twelfth of May — plus ISO `1998-05-12`, which is unambiguous because
 * the year leads. Bangla digits read as digits.
 *
 * Never `new Date(text)`: it reads the host's zone and guesses the order.
 */

const DAY_FIRST = /^(\d{1,2})[/.\-\s]+(\d{1,2})[/.\-\s]+(\d{4})$/;
const YEAR_FIRST = /^(\d{4})[/.\-\s]+(\d{1,2})[/.\-\s]+(\d{1,2})$/;

function normaliseDigits(text: string): string {
    let out = "";

    for (const char of text) {
        out += westernDigit(char) ?? char;
    }

    return out;
}

export function isValidCivilDate({ year, month, day }: CivilDate): boolean {
    return (
        Number.isInteger(year) &&
        Number.isInteger(month) &&
        Number.isInteger(day) &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= getDaysInMonth(year, month)
    );
}

export function isInSupportedRange(date: CivilDate): boolean {
    return date.year >= MIN_YEAR && date.year <= MAX_YEAR;
}

export function parseDateInput(text: string): DateInputResult {
    const trimmed = normaliseDigits(text.trim());

    if (trimmed.length === 0) {
        return { ok: false, reason: "empty" };
    }

    const dayFirst = DAY_FIRST.exec(trimmed);
    const yearFirst = dayFirst === null ? YEAR_FIRST.exec(trimmed) : null;

    let date: CivilDate;

    if (dayFirst !== null) {
        date = { day: Number(dayFirst[1]), month: Number(dayFirst[2]), year: Number(dayFirst[3]) };
    } else if (yearFirst !== null) {
        date = {
            year: Number(yearFirst[1]),
            month: Number(yearFirst[2]),
            day: Number(yearFirst[3]),
        };
    } else {
        return { ok: false, reason: "invalid_format" };
    }

    // Rolled-over fields are refused, not absorbed: 31/04 is a typo, not 1 May.
    if (!isValidCivilDate(date)) {
        return { ok: false, reason: "invalid_date" };
    }

    if (!isInSupportedRange(date)) {
        return { ok: false, reason: "out_of_range" };
    }

    return { ok: true, date };
}

function pad(value: number, width: number): string {
    return String(value).padStart(width, "0");
}

/** `1998-05-12`. */
export function formatIsoDate({ year, month, day }: CivilDate): string {
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** `12/05/1998` — the day-first form the date fields are prefilled with. */
export function formatDayFirst({ year, month, day }: CivilDate): string {
    return `${pad(day, 2)}/${pad(month, 2)}/${pad(year, 4)}`;
}

export function toDayNumber({ year, month, day }: CivilDate): number {
    return daysFromCivil(year, month, day);
}

export function compareDates(a: CivilDate, b: CivilDate): number {
    return toDayNumber(a) - toDayNumber(b);
}

/**
 * A typed whole number in either script: `""` is `null` (nothing typed), and
 * anything that is not all digits is `NaN`, so the caller can tell the two apart.
 */
export function parseWholeNumber(text: string): number | null {
    const trimmed = normaliseDigits(text.trim());

    if (trimmed.length === 0) {
        return null;
    }

    return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}
