import type { EpochUnit, TimestampOptions } from "../types";

/**
 * The widest instant a JavaScript `Date` can hold, ±100 000 000 days from the
 * epoch. Anything past it is reported as out of range rather than silently
 * becoming `Invalid Date`.
 */
export const MAX_EPOCH_MS = 8_640_000_000_000_000;
export const MIN_EPOCH_MS = -MAX_EPOCH_MS;

/** Long enough for any timestamp anyone pastes, short enough to bound the regex work. */
export const MAX_INPUT_LENGTH = 200;

/** Zones a reader can pin alongside Local and UTC. */
export const MAX_PINNED_TIME_ZONES = 4;

export const NANOS_PER_MILLISECOND = 1_000_000n;

/**
 * Nanoseconds in one unit of each scale, so every numeric input can be lifted
 * to one exact integer type. A 19-digit nanosecond timestamp is past
 * `Number.MAX_SAFE_INTEGER`, which is why this is `bigint` throughout.
 */
export const NANOS_PER_UNIT: Record<Exclude<EpochUnit, "auto">, bigint> = {
    seconds: 1_000_000_000n,
    milliseconds: 1_000_000n,
    microseconds: 1_000n,
    nanoseconds: 1n,
    // Windows FILETIME and .NET ticks both count 100-nanosecond intervals.
    filetime: 100n,
    ticks: 100n,
    // One Excel serial unit is a whole day.
    excel: 86_400_000_000_000n,
};

/**
 * Where each scale starts counting, in nanoseconds relative to the unix epoch.
 * Verified against `Date.UTC`, not from memory.
 *
 * - FILETIME counts from 1601-01-01 UTC.
 * - .NET ticks count from 0001-01-01 UTC, proleptic Gregorian.
 * - Excel serial 25569 is 1970-01-01, which bakes in the phantom 29 February
 *   1900 that the 1900 date system has always carried.
 */
export const EPOCH_OFFSET_NANOS: Record<Exclude<EpochUnit, "auto">, bigint> = {
    seconds: 0n,
    milliseconds: 0n,
    microseconds: 0n,
    nanoseconds: 0n,
    filetime: -11_644_473_600_000_000_000n,
    ticks: -62_135_596_800_000_000_000n,
    excel: -2_209_161_600_000_000_000n,
};

/**
 * Magnitude boundaries `auto` uses, each a thousand times the last. The first
 * covers seconds up to the year 5138, by which point a millisecond value of the
 * same size would sit in 1973 — no real timestamp lands in both.
 */
export const AUTO_UNIT_THRESHOLDS = {
    seconds: 100_000_000_000n,
    milliseconds: 100_000_000_000_000n,
    microseconds: 100_000_000_000_000_000n,
} as const;

export const DEFAULT_UNIT: EpochUnit = "auto";

/**
 * Zone-less input is read as UTC by default rather than as the reader's own
 * zone: a bare `2026-07-29T12:00:00` in a log file is almost always UTC, and a
 * default that changes with who is looking makes a shared link mean two things.
 */
export const DEFAULT_INPUT_TIME_ZONE = "UTC";

export const DEFAULT_TIMESTAMP_OPTIONS: TimestampOptions = {
    unit: DEFAULT_UNIT,
    inputTimeZone: DEFAULT_INPUT_TIME_ZONE,
    pinnedTimeZones: [],
};

/** Seeded into the picker so the first pinned zone is one click, not six. */
export const SUGGESTED_TIME_ZONES: readonly string[] = [
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Dhaka",
    "Asia/Kolkata",
    "Asia/Dubai",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
];

/**
 * One example per shape the parser recognises, shown as one-tap chips. Every
 * one names the same instant — 2026-07-29T12:00:00Z — so tapping through them
 * demonstrates the detector rather than jumping the reader around the calendar.
 *
 * These are data, not copy: they stay in Western digits in both locales because
 * they mirror machine input.
 */
export const EXAMPLE_INPUTS: readonly string[] = [
    "1785326400",
    "1785326400000",
    "2026-07-29T12:00:00Z",
    "Wed, 29 Jul 2026 12:00:00 GMT",
    "July 29, 2026 12:00 PM",
    "019fadbe-f200-7abc-9def-0123456789ab",
];
