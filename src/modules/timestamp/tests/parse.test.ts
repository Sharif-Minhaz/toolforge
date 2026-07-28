import { describe, expect, test } from "bun:test";

import { MAX_INPUT_LENGTH } from "@/modules/timestamp/domain/constants";
import {
    detectEpochUnit,
    parseTimestamp,
    type ParseTimestampRequest,
} from "@/modules/timestamp/domain/parse";
import type {
    DetectableEpochUnit,
    EpochUnit,
    ParseTimestampResult,
} from "@/modules/timestamp/types";

/** 2026-07-29T12:00:00Z — every fixture in this file names this instant. */
const TARGET = Date.UTC(2026, 6, 29, 12, 0, 0);

const NOW = new Date(Date.UTC(2026, 6, 26, 9, 30, 0));

function read(
    input: string,
    overrides: Partial<Omit<ParseTimestampRequest, "input">> = {},
): ParseTimestampResult {
    return parseTimestamp({
        input,
        unit: "auto",
        inputTimeZone: "UTC",
        now: NOW,
        ...overrides,
    });
}

/** Fails loudly rather than letting a `.epochMs` read off a failure be `undefined`. */
function epochOf(result: ParseTimestampResult): number {
    if (!result.ok) {
        throw new Error(`expected a parse, got ${result.reason}`);
    }

    return result.epochMs;
}

describe("detectEpochUnit", () => {
    const cases: readonly (readonly [bigint, DetectableEpochUnit])[] = [
        [0n, "seconds"],
        [1_785_326_400n, "seconds"],
        [99_999_999_999n, "seconds"],
        [100_000_000_000n, "milliseconds"],
        [1_785_326_400_000n, "milliseconds"],
        [1_785_326_400_000_000n, "microseconds"],
        [1_785_326_400_000_000_000n, "nanoseconds"],
    ];

    for (const [magnitude, expected] of cases) {
        test(`${magnitude} reads as ${expected}`, () => {
            expect(detectEpochUnit(magnitude)).toBe(expected);
        });
    }
});

describe("numeric epochs", () => {
    test("auto-detects each unix scale", () => {
        expect(read("1785326400")).toMatchObject({ epochMs: TARGET, unit: "seconds" });
        expect(read("1785326400000")).toMatchObject({ epochMs: TARGET, unit: "milliseconds" });
        expect(read("1785326400000000")).toMatchObject({ epochMs: TARGET, unit: "microseconds" });
        expect(read("1785326400000000000")).toMatchObject({
            epochMs: TARGET,
            unit: "nanoseconds",
        });
    });

    test("keeps sub-millisecond precision that a Number would round away", () => {
        const result = read("1785326400123456789");

        expect(result).toMatchObject({
            epochMs: TARGET + 123,
            subMilliNanos: 456_789,
            unit: "nanoseconds",
        });
    });

    test("an explicit unit overrides the magnitude", () => {
        expect(read("1785326400", { unit: "milliseconds" })).toMatchObject({
            epochMs: 1_785_326_400,
            unit: "milliseconds",
        });
        expect(read("1785326400000", { unit: "seconds" })).toMatchObject({
            unit: "seconds",
            epochMs: 1_785_326_400_000_000,
        });
    });

    test("reads the pre-epoch side", () => {
        expect(epochOf(read("-1"))).toBe(-1000);
        expect(epochOf(read("0"))).toBe(0);
        expect(epochOf(read("+1785326400"))).toBe(TARGET);
    });

    test("accepts a fractional second", () => {
        expect(read("1785326400.5")).toMatchObject({ epochMs: TARGET + 500 });
        expect(read("1785326400.123456789")).toMatchObject({
            epochMs: TARGET + 123,
            subMilliNanos: 456_789,
        });
    });

    test("never claims a zone it was not given", () => {
        expect(read("1785326400")).toMatchObject({ usedInputZone: false, kind: "epoch" });
    });

    test("rejects a value past what a Date can hold", () => {
        expect(read("99999999999999999999999", { unit: "seconds" })).toEqual({
            ok: false,
            reason: "out_of_range",
        });
    });
});

describe("Windows, .NET and Excel scales", () => {
    const cases: readonly (readonly [EpochUnit, string])[] = [
        ["filetime", "134298000000000000"],
        ["ticks", "639209232000000000"],
        ["excel", "46232.5"],
    ];

    for (const [unit, input] of cases) {
        test(`${unit} counts from its own epoch`, () => {
            expect(read(input, { unit })).toMatchObject({ epochMs: TARGET, unit });
        });
    }

    test("Excel serial 25569 is the unix epoch, phantom leap day and all", () => {
        expect(epochOf(read("25569", { unit: "excel" }))).toBe(0);
    });
});

describe("ISO 8601", () => {
    test("reads the offset the string carries", () => {
        expect(read("2026-07-29T12:00:00Z")).toMatchObject({
            epochMs: TARGET,
            kind: "iso8601",
            usedInputZone: false,
        });
        expect(epochOf(read("2026-07-29T18:00:00+06:00"))).toBe(TARGET);
        expect(epochOf(read("2026-07-29T18:00:00+0600"))).toBe(TARGET);
        expect(epochOf(read("2026-07-29T08:00:00-04:00"))).toBe(TARGET);
    });

    test("falls back to the input zone when the string carries none", () => {
        expect(read("2026-07-29T12:00:00")).toMatchObject({
            epochMs: TARGET,
            usedInputZone: true,
        });
        expect(epochOf(read("2026-07-29T18:00:00", { inputTimeZone: "Asia/Dhaka" }))).toBe(TARGET);
        expect(epochOf(read("2026-07-29T08:00:00", { inputTimeZone: "America/New_York" }))).toBe(
            TARGET,
        );
    });

    test("accepts a space where the T belongs", () => {
        expect(epochOf(read("2026-07-29 12:00:00"))).toBe(TARGET);
    });

    test("fills in the parts that were left off", () => {
        expect(epochOf(read("2026-07-29"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("2026-07"))).toBe(Date.UTC(2026, 6, 1));
        expect(epochOf(read("2026-07-29T12:00"))).toBe(TARGET);
    });

    test("keeps fractional seconds to nanosecond depth", () => {
        expect(read("2026-07-29T12:00:00.250Z")).toMatchObject({ epochMs: TARGET + 250 });
        expect(read("2026-07-29T12:00:00.123456789Z")).toMatchObject({
            epochMs: TARGET + 123,
            subMilliNanos: 456_789,
        });
        expect(epochOf(read("2026-07-29T12:00:00,250Z"))).toBe(TARGET + 250);
    });

    test("reads the basic format when a T removes the ambiguity", () => {
        expect(epochOf(read("20260729T120000Z"))).toBe(TARGET);
        expect(epochOf(read("20260729T1200Z"))).toBe(TARGET);
    });

    test("reads a bare 8-digit number as an epoch, not a basic date", () => {
        expect(read("20260729")).toMatchObject({ kind: "epoch", unit: "seconds" });
    });

    test("reads ordinal dates", () => {
        expect(epochOf(read("2026-210"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("2024-060"))).toBe(Date.UTC(2024, 1, 29));
        expect(read("2026-366")).toEqual({ ok: false, reason: "invalid_component", field: "day" });
    });

    test("reads week dates", () => {
        expect(epochOf(read("2026-W31-3"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("2026-W31"))).toBe(Date.UTC(2026, 6, 27));
        expect(read("2025-W53-1")).toEqual({
            ok: false,
            reason: "invalid_component",
            field: "day",
        });
    });

    test("reads expanded years, where every one of the six digits counts", () => {
        expect(epochOf(read("+002026-07-29T12:00:00Z"))).toBe(TARGET);
        expect(epochOf(read("+012026-07-29T12:00:00Z"))).toBe(Date.UTC(12_026, 6, 29, 12));
        expect(epochOf(read("-000001-07-29T12:00:00Z"))).toBe(
            new Date("-000001-07-29T12:00:00Z").getTime(),
        );
    });
});

describe("RFC 2822, HTTP and Date.toString", () => {
    test("reads an RFC 2822 date", () => {
        expect(read("Wed, 29 Jul 2026 12:00:00 GMT")).toMatchObject({
            epochMs: TARGET,
            kind: "rfc2822",
            usedInputZone: false,
        });
        expect(epochOf(read("29 Jul 2026 12:00:00 +0000"))).toBe(TARGET);
        expect(epochOf(read("Wed, 29 Jul 2026 18:00:00 +0600"))).toBe(TARGET);
    });

    test("reads the alphabetic zones RFC 2822 still defines", () => {
        expect(epochOf(read("Wed, 29 Jul 2026 08:00:00 EDT"))).toBe(TARGET);
        expect(epochOf(read("Wed, 29 Jul 2026 07:00:00 EST"))).toBe(TARGET);
        expect(epochOf(read("Wed, 29 Jul 2026 05:00:00 PDT"))).toBe(TARGET);
    });

    test("falls back to the input zone for an abbreviation it will not guess at", () => {
        // IST alone means three different offsets, so it is treated as absent.
        expect(read("Wed, 29 Jul 2026 12:00:00 IST")).toMatchObject({
            epochMs: TARGET,
            usedInputZone: true,
        });
    });

    test("reads what Date.prototype.toString emits, parenthetical and all", () => {
        expect(epochOf(read("Wed Jul 29 2026 18:00:00 GMT+0600 (Bangladesh Standard Time)"))).toBe(
            TARGET,
        );
        expect(
            epochOf(read("Wed Jul 29 2026 12:00:00 GMT+0000 (Coordinated Universal Time)")),
        ).toBe(TARGET);
    });

    test("reads the asctime order", () => {
        expect(epochOf(read("Wed Jul 29 12:00:00 2026"))).toBe(TARGET);
    });
});

describe("dates people type", () => {
    test("reads month names in either order", () => {
        expect(epochOf(read("July 29, 2026"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("29 July 2026"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("Jul 29 2026"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("2026 July 29"))).toBe(Date.UTC(2026, 6, 29));
    });

    test("reads a 12-hour clock", () => {
        expect(epochOf(read("July 29, 2026 12:00 PM"))).toBe(TARGET);
        expect(epochOf(read("July 29, 2026 12:00 AM"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("July 29, 2026 at 6:00 pm"))).toBe(Date.UTC(2026, 6, 29, 18));
    });

    test("reads an ordinal day", () => {
        expect(epochOf(read("July 29th, 2026"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("1st Jan 2026"))).toBe(Date.UTC(2026, 0, 1));
    });

    test("reads a slash date when the year leads", () => {
        expect(epochOf(read("2026/07/29"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("2026/07/29 12:00:00"))).toBe(TARGET);
    });

    test("resolves a day-first or month-first date when only one reading fits", () => {
        expect(epochOf(read("29/07/2026"))).toBe(Date.UTC(2026, 6, 29));
        expect(epochOf(read("07/29/2026"))).toBe(Date.UTC(2026, 6, 29));
    });

    test("refuses to guess when both readings fit", () => {
        expect(read("07/08/2026")).toEqual({ ok: false, reason: "ambiguous_date" });
        expect(read("07-08-2026")).toEqual({ ok: false, reason: "ambiguous_date" });
    });

    test("uses the input zone, since none of these carry one", () => {
        expect(read("July 29, 2026 18:00", { inputTimeZone: "Asia/Dhaka" })).toMatchObject({
            epochMs: TARGET,
            usedInputZone: true,
            kind: "dateString",
        });
    });
});

describe("identifier formats", () => {
    test("reads the timestamp out of a UUID v7", () => {
        expect(read("019fadbe-f200-7abc-9def-0123456789ab")).toMatchObject({
            epochMs: TARGET,
            kind: "uuid",
        });
    });

    test("reads the timestamp out of a UUID v1", () => {
        expect(read("064e6000-8b45-11f1-8def-0123456789ab")).toMatchObject({
            epochMs: TARGET,
            kind: "uuid",
        });
    });

    test("reads the timestamp out of a UUID v6", () => {
        expect(read("1f18b450-64e6-6000-8def-0123456789ab")).toMatchObject({
            epochMs: TARGET,
            kind: "uuid",
        });
    });

    test("says so when the version holds no time at all", () => {
        expect(read("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toEqual({
            ok: false,
            reason: "unrecognized",
        });
    });

    test("accepts an unhyphenated UUID", () => {
        expect(epochOf(read("019fadbef2007abc9def0123456789ab"))).toBe(TARGET);
    });

    test("reads the creation time out of a MongoDB ObjectId", () => {
        expect(read("6a69eb40a1b2c3d4e5f60718")).toMatchObject({
            epochMs: TARGET,
            kind: "objectId",
        });
    });

    test("is case-insensitive about hex", () => {
        expect(epochOf(read("6A69EB40A1B2C3D4E5F60718"))).toBe(TARGET);
    });
});

describe("now", () => {
    test("reads the injected clock, not the machine's", () => {
        expect(read("now")).toEqual({
            ok: true,
            epochMs: NOW.getTime(),
            kind: "now",
            usedInputZone: false,
            subMilliNanos: 0,
        });
        expect(epochOf(read("NOW"))).toBe(NOW.getTime());
    });
});

describe("failures", () => {
    test("reports an empty input as empty rather than invalid", () => {
        expect(read("")).toEqual({ ok: false, reason: "empty" });
        expect(read("   ")).toEqual({ ok: false, reason: "empty" });
    });

    test("refuses an input no timestamp could be", () => {
        expect(read("x".repeat(MAX_INPUT_LENGTH + 1))).toEqual({ ok: false, reason: "too_long" });
    });

    test("names the component that was out of range", () => {
        expect(read("2026-02-30")).toEqual({
            ok: false,
            reason: "invalid_component",
            field: "day",
        });
        expect(read("2026-13-01")).toEqual({
            ok: false,
            reason: "invalid_component",
            field: "month",
        });
        expect(read("2026-07-29T25:00:00Z")).toEqual({
            ok: false,
            reason: "invalid_component",
            field: "hour",
        });
        expect(read("2026-07-29T12:61:00Z")).toEqual({
            ok: false,
            reason: "invalid_component",
            field: "minute",
        });
    });

    test("accepts 29 February only in a leap year", () => {
        expect(epochOf(read("2024-02-29"))).toBe(Date.UTC(2024, 1, 29));
        expect(read("2026-02-29")).toMatchObject({ ok: false, field: "day" });
    });

    test("rejects an input zone that is not in the shipped list", () => {
        expect(read("1785326400", { inputTimeZone: "Middle/Earth" })).toEqual({
            ok: false,
            reason: "unknown_time_zone",
        });
    });

    test("gives up on text that is not a date", () => {
        expect(read("hello world")).toEqual({ ok: false, reason: "unrecognized" });
        expect(read("2026-07-29T12:00:00!")).toEqual({ ok: false, reason: "unrecognized" });
        expect(read("July 2026")).toEqual({ ok: false, reason: "unrecognized" });
    });
});

describe("determinism", () => {
    test("a zone-less input never depends on the host's own zone", () => {
        // The whole reason this module never calls `new Date(string)`: the
        // engine would read this against process.env.TZ, so a server render and
        // a browser render of the same link would disagree.
        const asUtc = epochOf(read("2026-07-29T12:00:00", { inputTimeZone: "UTC" }));
        const asDhaka = epochOf(read("2026-07-29T12:00:00", { inputTimeZone: "Asia/Dhaka" }));

        expect(asUtc).toBe(TARGET);
        expect(asDhaka).toBe(TARGET - 6 * 3_600_000);
    });

    test("the same input parses the same way every time", () => {
        for (const input of ["1785326400", "2026-07-29T12:00:00Z", "July 29, 2026"]) {
            expect(read(input)).toEqual(read(input));
        }
    });
});
