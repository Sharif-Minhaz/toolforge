/**
 * How a numeric input is scaled to an instant. `auto` reads the magnitude;
 * everything else is an explicit override for a format whose digit count
 * collides with another one.
 */
export const EPOCH_UNITS = [
    "auto",
    "seconds",
    "milliseconds",
    "microseconds",
    "nanoseconds",
    "filetime",
    "ticks",
    "excel",
] as const;

export type EpochUnit = (typeof EPOCH_UNITS)[number];

/** The units `auto` is allowed to land on, in ascending magnitude. */
export const DETECTABLE_EPOCH_UNITS = [
    "seconds",
    "milliseconds",
    "microseconds",
    "nanoseconds",
] as const;

export type DetectableEpochUnit = (typeof DETECTABLE_EPOCH_UNITS)[number];

/**
 * What the parser recognised the input as. Reported back to the UI so the
 * result can say *why* it read the input the way it did — the single most
 * common source of confusion in a timestamp tool.
 */
export const TIMESTAMP_SOURCE_KINDS = [
    "now",
    "epoch",
    "iso8601",
    "rfc2822",
    "dateString",
    "objectId",
    "uuid",
] as const;

export type TimestampSourceKind = (typeof TIMESTAMP_SOURCE_KINDS)[number];

export type TimestampFailureReason =
    /** Nothing to parse yet. */
    | "empty"
    /** Past `MAX_INPUT_LENGTH`; no timestamp is that long. */
    | "too_long"
    /** The text matched no known shape. */
    | "unrecognized"
    /** `07/08/2026` — could be 7 August or 8 July. */
    | "ambiguous_date"
    /** `2026-02-30`, `25:00`, month 13. */
    | "invalid_component"
    /** Parsed, but lands outside the range a `Date` can hold. */
    | "out_of_range"
    /** The named zone is not in the shipped IANA snapshot. */
    | "unknown_time_zone";

export type TimestampFailure = {
    readonly ok: false;
    readonly reason: TimestampFailureReason;
    /** Set for `invalid_component`, naming the field that was wrong. */
    readonly field?: "year" | "month" | "day" | "hour" | "minute" | "second";
};

/**
 * A successfully read instant, plus everything the UI needs to explain the
 * reading. `epochMs` is the single source of truth; every rendering derives
 * from it.
 */
export type ParsedTimestamp = {
    readonly ok: true;
    readonly epochMs: number;
    readonly kind: TimestampSourceKind;
    /** Which scale a numeric input was read at; `undefined` for text inputs. */
    readonly unit?: DetectableEpochUnit | Extract<EpochUnit, "filetime" | "ticks" | "excel">;
    /**
     * True when the input carried no zone of its own and the configured input
     * zone had to supply one. Drives the "interpreted as <zone>" hint.
     */
    readonly usedInputZone: boolean;
    /** Sub-millisecond remainder, kept so µs/ns input survives a round trip. */
    readonly subMilliNanos: number;
};

export type ParseTimestampResult = ParsedTimestamp | TimestampFailure;

/**
 * Why a zone is on screen. `local` and `utc` are always there; `pinned` ones
 * the reader added. Drives the card's icon, title and whether it can be removed.
 */
export type ZoneRole = "local" | "utc" | "pinned";

/** One zone on screen, before its instant has been rendered. */
export type ZoneSlot = {
    readonly timeZone: string;
    readonly role: ZoneRole;
};

/** Broken-down wall-clock fields, always relative to some named zone. */
export type ZonedFields = {
    readonly year: number;
    /** 1–12, not the `Date` 0–11. */
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly millisecond: number;
};

/** One instant, rendered for one zone. Every string is display-ready. */
export type ZonedRendering = {
    readonly timeZone: string;
    /** Minutes east of UTC at this instant, e.g. `360` for Asia/Dhaka. */
    readonly offsetMinutes: number;
    /** `+06:00`, or `Z` at zero. */
    readonly offsetLabel: string;
    /** `GMT+6`, from the runtime's own zone data. */
    readonly shortOffset: string;
    /** `BST`, `EDT`, `+06` — whatever the zone is abbreviated to. */
    readonly abbreviation: string;
    /** `Bangladesh Standard Time` — the plain-language name, in the reader's locale. */
    readonly zoneName: string;
    /** Locale-formatted, so Bangla gets Bengali numerals. */
    readonly fullDate: string;
    readonly dateOnly: string;
    readonly timeOnly: string;
    readonly weekday: string;
    /** `2026-07-29T18:00:00+06:00` — machine-readable, Western digits. */
    readonly iso8601: string;
    /** `Wed, 29 Jul 2026 18:00:00 +0600` — machine-readable, Western digits. */
    readonly rfc2822: string;
    /** True when this zone observes DST and is currently inside it. */
    readonly inDaylightTime: boolean;
};

/** Zone-independent facts about the instant, for the details panel. */
export type CalendarFacts = {
    readonly dayOfYear: number;
    readonly isoWeek: number;
    readonly isoWeekYear: number;
    /** `2026-W31-3`, the ISO 8601 week date. */
    readonly isoWeekDate: string;
    readonly quarter: number;
    readonly daysInMonth: number;
    readonly leapYear: boolean;
    /** Days from the start of the input zone's today; negative for the past. */
    readonly dayOffsetFromToday: number;
};

/** The four unix scales, as exact decimal strings rather than lossy numbers. */
export type EpochRendering = {
    readonly seconds: string;
    readonly milliseconds: string;
    readonly microseconds: string;
    readonly nanoseconds: string;
};

export type TimestampOptions = {
    readonly unit: EpochUnit;
    /** Supplies the zone for any input that carries none of its own. */
    readonly inputTimeZone: string;
    /** Zones pinned alongside Local and UTC, in the order they were added. */
    readonly pinnedTimeZones: readonly string[];
};

export type TimestampExportRequest = {
    readonly input: string;
    readonly epochMs: number;
    readonly timeZones: readonly string[];
    readonly locale: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
