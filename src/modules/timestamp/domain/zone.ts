import type { ZonedFields } from "../types";

/**
 * Wall-clock arithmetic for a named IANA zone, built on `Intl` alone.
 *
 * The one rule the rest of the module depends on: an instant is a number of
 * milliseconds and nothing else. A zone only ever enters when that number is
 * turned into fields, or when fields are turned back into a number. Nothing
 * here reads the host's own zone, so a server render and its hydrated
 * counterpart always agree.
 */

/** `Intl.DateTimeFormat` construction is expensive; each shape is built once. */
const FIELD_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function fieldFormatter(timeZone: string): Intl.DateTimeFormat {
    const cached = FIELD_FORMATTERS.get(timeZone);

    if (cached !== undefined) {
        return cached;
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        // `era` keeps years before 1 CE readable: `formatToParts` reports the
        // era year, so `1 BC` has to be folded back to astronomical year 0.
        era: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        // `hour12: false` still yields "24" on some engines; `h23` never does.
        hourCycle: "h23",
    });

    FIELD_FORMATTERS.set(timeZone, formatter);

    return formatter;
}

/**
 * True when the running engine can format this zone. The shipped list is a
 * snapshot, so an engine with older zone data may not know every entry — the
 * picker still offers them all and this is what catches the difference.
 */
export function isFormattableTimeZone(timeZone: string): boolean {
    try {
        fieldFormatter(timeZone).format(0);

        return true;
    } catch {
        return false;
    }
}

/**
 * `Date.UTC` maps years 0–99 onto 1900–1999, so those need the long way round.
 * Callers validate the components first, which is why a rolled-over date (Feb
 * 30) cannot reach here.
 */
export function fieldsToUtcMs(fields: ZonedFields): number {
    const ms = Date.UTC(
        fields.year,
        fields.month - 1,
        fields.day,
        fields.hour,
        fields.minute,
        fields.second,
        fields.millisecond,
    );

    if (fields.year < 0 || fields.year > 99) {
        return ms;
    }

    const shifted = new Date(ms);
    shifted.setUTCFullYear(fields.year);

    return shifted.getTime();
}

function readPart(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
    return parts.find((part) => part.type === type)?.value ?? "";
}

/** Breaks an instant into the wall-clock fields a reader in `timeZone` sees. */
export function getZonedFields(epochMs: number, timeZone: string): ZonedFields {
    const parts = fieldFormatter(timeZone).formatToParts(new Date(epochMs));
    const eraYear = Number.parseInt(readPart(parts, "year"), 10);
    const era = readPart(parts, "era");

    return {
        // Proleptic astronomical numbering: 1 BC is year 0, 2 BC is year −1.
        year: era === "BC" ? 1 - eraYear : eraYear,
        month: Number.parseInt(readPart(parts, "month"), 10),
        day: Number.parseInt(readPart(parts, "day"), 10),
        hour: Number.parseInt(readPart(parts, "hour"), 10),
        minute: Number.parseInt(readPart(parts, "minute"), 10),
        second: Number.parseInt(readPart(parts, "second"), 10),
        // No zone offset has ever had a sub-second component, so the remainder
        // is the same in every zone and `formatToParts` need not report it.
        millisecond: ((epochMs % 1000) + 1000) % 1000,
    };
}

/**
 * Milliseconds east of UTC in `timeZone` at `epochMs`. Exact rather than
 * rounded: pre-1900 local mean times carry a seconds component, and rounding
 * it away would make the rendered wall clock disagree with the instant.
 */
export function getOffsetMs(epochMs: number, timeZone: string): number {
    const fields = getZonedFields(epochMs, timeZone);
    const asUtc = fieldsToUtcMs({ ...fields, millisecond: 0 });

    return asUtc - Math.floor(epochMs / 1000) * 1000;
}

export function getOffsetMinutes(epochMs: number, timeZone: string): number {
    return getOffsetMs(epochMs, timeZone) / 60_000;
}

/**
 * Turns a wall clock in `timeZone` back into an instant.
 *
 * The offset that applies depends on the answer, so this guesses and checks.
 * The first guess subtracts the offset in force at the naive instant. If
 * re-reading the offset at that guess agrees, it is the answer.
 *
 * When they disagree a transition sits between them, and there are two shapes:
 *
 * - **Autumn overlap** — the wall clock happens twice. The first guess already
 *   names the earlier of the two, which is the one people mean.
 * - **Spring gap** — the wall clock never happens. The second candidate does
 *   not reproduce its own offset, which is how the gap is detected; the result
 *   then lands the gap's width past the transition, as every other date library
 *   does with a nonexistent local time.
 */
export function zonedFieldsToEpochMs(fields: ZonedFields, timeZone: string): number {
    const naive = fieldsToUtcMs(fields);
    const firstOffset = getOffsetMs(naive, timeZone);
    const firstGuess = naive - firstOffset;
    const secondOffset = getOffsetMs(firstGuess, timeZone);

    if (secondOffset === firstOffset) {
        return firstGuess;
    }

    const secondGuess = naive - secondOffset;

    return getOffsetMs(secondGuess, timeZone) === secondOffset ? secondGuess : firstGuess;
}

/** `+06:00`, `-04:30`, `Z`, or `+06:01:40` where a zone's offset carries seconds. */
export function formatOffsetLabel(offsetMs: number): string {
    if (offsetMs === 0) {
        return "Z";
    }

    const sign = offsetMs < 0 ? "-" : "+";
    const total = Math.abs(offsetMs) / 1000;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = Math.floor(total % 60);
    const base = `${sign}${pad2(hours)}:${pad2(minutes)}`;

    return seconds === 0 ? base : `${base}:${pad2(seconds)}`;
}

/** `+0600` — the RFC 2822 spelling, which never carries a colon. */
export function formatRfcOffset(offsetMs: number): string {
    const sign = offsetMs < 0 ? "-" : "+";
    const total = Math.abs(offsetMs) / 1000;

    return `${sign}${pad2(Math.floor(total / 3600))}${pad2(Math.floor((total % 3600) / 60))}`;
}

export function pad2(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * True when the zone observes daylight saving *and* `epochMs` falls inside it.
 * Derived by comparing against the smallest offset the zone uses across the
 * surrounding year, which is what standard time means for every zone in the
 * database — including the southern hemisphere, where DST straddles January.
 */
export function isInDaylightTime(epochMs: number, timeZone: string): boolean {
    const current = getOffsetMs(epochMs, timeZone);
    const { year } = getZonedFields(epochMs, timeZone);
    const january = getOffsetMs(fieldsToUtcMs(atNoonUtc(year, 1)), timeZone);
    const july = getOffsetMs(fieldsToUtcMs(atNoonUtc(year, 7)), timeZone);

    return current > Math.min(january, july);
}

function atNoonUtc(year: number, month: number): ZonedFields {
    return { year, month, day: 15, hour: 12, minute: 0, second: 0, millisecond: 0 };
}
