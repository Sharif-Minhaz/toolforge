import { MAX_RECORDS } from "./constants";
import type { SubdomainRecord } from "../types";

/**
 * Reads the index's reply.
 *
 * The endpoint answers `text/plain`, one name per line, and with `dates=1` a
 * tab and an ISO-8601 instant after each name. Plain text rather than the JSON
 * the same endpoint can produce, deliberately: the JSON form of the same answer
 * is roughly two and a half times the bytes for exactly the same two fields,
 * and this is the tool whose whole problem is that the answer can be enormous.
 *
 * Nothing here trusts the body. It is a third party's output, it lands in a CSV
 * somebody keeps, and one malformed line must not become a row that reads as a
 * finding:
 *
 * - **A name that is not under the apex is dropped.** The index has never
 *   returned one, and if it ever does, silently filing `evil.example.net` under
 *   a lookup for `example.com` is the kind of wrong row this cannot afford.
 * - **A date is kept only when it is unambiguous.** A timestamp without a zone
 *   is read against whatever clock parses it, so it would mean one instant on
 *   the server and another in the reader's browser. Anything that is not an
 *   explicit-offset instant is recorded as no date at all, which the UI already
 *   has to render for the sources that carry none.
 * - **Duplicates collapse**, keeping the earliest date seen for the name.
 */

export type ParsedIndex = {
    readonly records: readonly SubdomainRecord[];
    /** Valid names the body held, counted before the cap was applied. */
    readonly returned: number;
    readonly truncated: boolean;
};

/**
 * An instant with an explicit zone: `Z`, `+06:00`, or `-0700`. Anchored at both
 * ends, and no `g` flag — a module-level `RegExp` carrying `lastIndex` is state
 * shared by every request this server handles.
 */
const ABSOLUTE_INSTANT =
    /^(\d{4})-(\d{2})-(\d{2})[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/**
 * Whether the calendar actually has that day.
 *
 * Needed because `Date.parse` is strict about every field except this one: a
 * month of 13, an hour of 25 and a minute of 61 are all `NaN`, but
 * `2026-02-31T00:00:00Z` silently becomes the 3rd of March — verified on both
 * Node and Bun, which agree. A first-seen date that quietly moved to another
 * month is a wrong fact in a report somebody keeps, so the day is checked
 * against the month's real length before the string is trusted.
 */
function isRealDay(year: number, month: number, day: number): boolean {
    const stamp = new Date(Date.UTC(year, month - 1, day));

    return (
        stamp.getUTCFullYear() === year &&
        stamp.getUTCMonth() === month - 1 &&
        stamp.getUTCDate() === day
    );
}

function readInstant(value: string): string | null {
    const shape = ABSOLUTE_INSTANT.exec(value);

    if (shape === null) {
        return null;
    }

    if (!isRealDay(Number(shape[1]), Number(shape[2]), Number(shape[3]))) {
        return null;
    }

    const parsed = Date.parse(value);

    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** `null` for the apex row itself, which has nothing to the left of the apex. */
function labelOf(name: string, apex: string): string | null {
    return name === apex ? null : name.slice(0, name.length - apex.length - 1);
}

export function parseSubdomainIndex(
    body: string,
    apex: string,
    maxRecords: number = MAX_RECORDS,
): ParsedIndex {
    const suffix = `.${apex}`;
    const seen = new Map<string, string | null>();
    let returned = 0;

    for (const line of body.split("\n")) {
        const trimmed = line.trim();

        if (trimmed.length === 0) {
            continue;
        }

        const [rawName, rawDate] = trimmed.split("\t");
        const name = (rawName ?? "").trim().replace(/\.+$/, "").toLowerCase();

        if (name !== apex && !name.endsWith(suffix)) {
            continue;
        }

        const firstSeen = rawDate === undefined ? null : readInstant(rawDate.trim());
        const held = seen.get(name);

        if (held === undefined) {
            returned += 1;

            // Past the cap the name is counted and discarded, so `returned`
            // still reports what the index actually held rather than what fitted.
            if (seen.size < maxRecords) {
                seen.set(name, firstSeen);
            }

            continue;
        }

        // The earliest date wins: two sources for one name are two sightings of
        // it, and the first sighting is what "first seen" means.
        if (firstSeen !== null && (held === null || firstSeen < held)) {
            seen.set(name, firstSeen);
        }
    }

    const records: SubdomainRecord[] = [];

    for (const [name, firstSeen] of seen) {
        const label = labelOf(name, apex);

        records.push({
            name,
            label,
            depth: label === null ? 0 : label.split(".").length,
            firstSeen,
        });
    }

    return { records, returned, truncated: returned > seen.size };
}
