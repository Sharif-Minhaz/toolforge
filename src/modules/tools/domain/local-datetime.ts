import { getZonedFields, pad2, zonedFieldsToEpochMs } from "./zone";
import type { ZonedFields } from "../types";

/**
 * The two directions an `<input type="datetime-local">` value has to travel.
 *
 * A `datetime-local` value carries no offset, which is exactly the trap
 * `CLAUDE.md` warns about: `new Date("2026-08-09T17:00")` is parsed against
 * whichever zone the host happens to be in, so the same string becomes two
 * different instants on the server and in the browser. Nothing here goes near
 * `new Date(string)` — the fields are read out by hand and handed to the shared
 * zone arithmetic with an explicit zone.
 */

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Fields as typed, with no zone attached yet. `null` for anything malformed. */
export function parseLocalDateTime(value: string): ZonedFields | null {
    const match = LOCAL_DATE_TIME.exec(value.trim());

    if (match === null) {
        return null;
    }

    const [, year, month, day, hour, minute, second] = match;

    const fields: ZonedFields = {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: second === undefined ? 0 : Number(second),
        millisecond: 0,
    };

    // A rolled-over date — the 31st of February, hour 25 — would otherwise be
    // silently absorbed into the next month by the arithmetic downstream.
    if (
        fields.month < 1 ||
        fields.month > 12 ||
        fields.day < 1 ||
        fields.day > 31 ||
        fields.hour > 23 ||
        fields.minute > 59 ||
        fields.second > 59
    ) {
        return null;
    }

    return fields;
}

/**
 * A typed wall clock, read in a named zone, as an ISO instant ready to cross a
 * server-action boundary. `null` when the field is blank or malformed — the
 * caller treats "no window" and "nonsense" the same way a form does.
 */
export function localDateTimeToInstant(value: string, timeZone: string): string | null {
    const fields = parseLocalDateTime(value);

    if (fields === null) {
        return null;
    }

    const epochMs = zonedFieldsToEpochMs(fields, timeZone);

    return Number.isFinite(epochMs) ? new Date(epochMs).toISOString() : null;
}

/** The reverse, for filling the edit form with a window that already exists. */
export function instantToLocalDateTime(iso: string | null, timeZone: string): string {
    if (iso === null) {
        return "";
    }

    const epochMs = Date.parse(iso);

    if (!Number.isFinite(epochMs)) {
        return "";
    }

    const fields = getZonedFields(epochMs, timeZone);

    return (
        `${String(fields.year).padStart(4, "0")}-${pad2(fields.month)}-${pad2(fields.day)}` +
        `T${pad2(fields.hour)}:${pad2(fields.minute)}`
    );
}
