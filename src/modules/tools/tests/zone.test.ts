import { describe, expect, test } from "bun:test";

import {
    fieldsToUtcMs,
    formatOffsetLabel,
    formatRfcOffset,
    getOffsetMinutes,
    getOffsetMs,
    getZonedFields,
    isFormattableTimeZone,
    isInDaylightTime,
    zonedFieldsToEpochMs,
} from "@/modules/tools/domain/zone";
import type { ZonedFields } from "@/modules/tools/types";

const JULY = Date.UTC(2026, 6, 15, 12, 0, 0);
const JANUARY = Date.UTC(2026, 0, 15, 12, 0, 0);

function fields(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
): ZonedFields {
    return { year, month, day, hour, minute, second, millisecond: 0 };
}

describe("getOffsetMinutes", () => {
    const cases: readonly (readonly [string, number, number])[] = [
        ["UTC", JULY, 0],
        ["Asia/Dhaka", JULY, 360],
        ["Asia/Kolkata", JULY, 330],
        ["Pacific/Chatham", JULY, 765],
        ["America/New_York", JULY, -240],
        ["America/New_York", JANUARY, -300],
        ["Australia/Sydney", JULY, 600],
        ["Australia/Sydney", JANUARY, 660],
    ];

    for (const [zone, instant, expected] of cases) {
        test(`${zone} at ${new Date(instant).toISOString()} is ${expected} minutes`, () => {
            expect(getOffsetMinutes(instant, zone)).toBe(expected);
        });
    }

    test("keeps the seconds a pre-1900 local mean time carries", () => {
        // Dhaka ran on LMT +06:01:40 until 1890.
        expect(getOffsetMs(Date.UTC(1888, 0, 1), "Asia/Dhaka")).toBe(21_700_000);
    });
});

describe("getZonedFields", () => {
    test("breaks an instant into the wall clock a reader sees", () => {
        expect(getZonedFields(Date.UTC(2026, 6, 29, 12, 0, 0, 250), "Asia/Dhaka")).toEqual({
            year: 2026,
            month: 7,
            day: 29,
            hour: 18,
            minute: 0,
            second: 0,
            millisecond: 250,
        });
    });

    test("crosses midnight backwards where the offset is negative", () => {
        expect(getZonedFields(Date.UTC(2026, 6, 29, 2, 0, 0), "America/New_York")).toMatchObject({
            year: 2026,
            month: 7,
            day: 28,
            hour: 22,
        });
    });

    test("reports years before 1 CE as astronomical numbers", () => {
        // 1 BC is astronomical year 0.
        expect(getZonedFields(Date.UTC(-1, 0, 1), "UTC")).toMatchObject({ year: -1 });
    });

    test("keeps sub-second detail for negative instants", () => {
        expect(getZonedFields(-1500, "UTC")).toEqual({
            year: 1969,
            month: 12,
            day: 31,
            hour: 23,
            minute: 59,
            second: 58,
            millisecond: 500,
        });
    });
});

describe("fieldsToUtcMs", () => {
    test("matches Date.UTC above year 99", () => {
        expect(fieldsToUtcMs(fields(2026, 7, 29, 12))).toBe(Date.UTC(2026, 6, 29, 12));
    });

    test("does not fold years 0–99 into the twentieth century", () => {
        const year50 = fieldsToUtcMs(fields(50, 1, 1));

        expect(new Date(year50).getUTCFullYear()).toBe(50);
        expect(fieldsToUtcMs(fields(4, 2, 29))).toBe(new Date("0004-02-29T00:00:00Z").getTime());
    });
});

describe("zonedFieldsToEpochMs", () => {
    test("round-trips through every zone in the picker's first page", () => {
        for (const zone of ["UTC", "Asia/Dhaka", "America/New_York", "Pacific/Chatham"]) {
            const instant = Date.UTC(2026, 6, 29, 12, 34, 56);

            expect(zonedFieldsToEpochMs(getZonedFields(instant, zone), zone)).toBe(instant);
        }
    });

    test("reads a wall clock in the zone it was written in", () => {
        expect(zonedFieldsToEpochMs(fields(2026, 7, 29, 18), "Asia/Dhaka")).toBe(
            Date.UTC(2026, 6, 29, 12),
        );
        expect(zonedFieldsToEpochMs(fields(2026, 7, 29, 8), "America/New_York")).toBe(
            Date.UTC(2026, 6, 29, 12),
        );
    });

    test("lands after the transition for a wall clock the spring gap skipped", () => {
        // 2026-03-08 02:30 never happens in New York; the clock jumps 02:00 → 03:00.
        const instant = zonedFieldsToEpochMs(fields(2026, 3, 8, 2, 30), "America/New_York");

        expect(instant).toBe(Date.UTC(2026, 2, 8, 7, 30));
        expect(getZonedFields(instant, "America/New_York")).toMatchObject({ hour: 3, minute: 30 });
    });

    test("takes the earlier reading for a wall clock the autumn overlap repeats", () => {
        // 2026-11-01 01:30 happens twice; the first is still on daylight time.
        const instant = zonedFieldsToEpochMs(fields(2026, 11, 1, 1, 30), "America/New_York");

        expect(instant).toBe(Date.UTC(2026, 10, 1, 5, 30));
        expect(getOffsetMinutes(instant, "America/New_York")).toBe(-240);
    });
});

describe("offset labels", () => {
    test("spells whole and half-hour offsets", () => {
        expect(formatOffsetLabel(0)).toBe("Z");
        expect(formatOffsetLabel(6 * 3_600_000)).toBe("+06:00");
        expect(formatOffsetLabel(-4 * 3_600_000)).toBe("-04:00");
        expect(formatOffsetLabel(5.5 * 3_600_000)).toBe("+05:30");
        expect(formatOffsetLabel(12.75 * 3_600_000)).toBe("+12:45");
    });

    test("adds seconds only when the zone actually carries them", () => {
        expect(formatOffsetLabel(21_700_000)).toBe("+06:01:40");
    });

    test("RFC 2822 drops the colon and never shows Z", () => {
        expect(formatRfcOffset(0)).toBe("+0000");
        expect(formatRfcOffset(6 * 3_600_000)).toBe("+0600");
        expect(formatRfcOffset(-4.5 * 3_600_000)).toBe("-0430");
    });
});

describe("isInDaylightTime", () => {
    test("is true only inside the zone's summer offset", () => {
        expect(isInDaylightTime(JULY, "America/New_York")).toBe(true);
        expect(isInDaylightTime(JANUARY, "America/New_York")).toBe(false);
    });

    test("follows the southern hemisphere's calendar", () => {
        expect(isInDaylightTime(JANUARY, "Australia/Sydney")).toBe(true);
        expect(isInDaylightTime(JULY, "Australia/Sydney")).toBe(false);
    });

    test("is false everywhere the zone never shifts", () => {
        expect(isInDaylightTime(JULY, "UTC")).toBe(false);
        expect(isInDaylightTime(JULY, "Asia/Dhaka")).toBe(false);
        expect(isInDaylightTime(JANUARY, "Asia/Kolkata")).toBe(false);
    });
});

describe("isFormattableTimeZone", () => {
    test("accepts the ids the picker offers and rejects invented ones", () => {
        expect(isFormattableTimeZone("Asia/Dhaka")).toBe(true);
        expect(isFormattableTimeZone("UTC")).toBe(true);
        expect(isFormattableTimeZone("Middle/Earth")).toBe(false);
    });
});
