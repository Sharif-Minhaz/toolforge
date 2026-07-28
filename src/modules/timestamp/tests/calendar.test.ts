import { describe, expect, test } from "bun:test";

import {
    buildCalendarFacts,
    civilFromDays,
    daysFromCivil,
    formatIsoWeekDate,
    fromIsoWeekDate,
    fromOrdinalDate,
    getDayOfYear,
    getDaysInMonth,
    getIsoDayOfWeek,
    getIsoWeek,
    getQuarter,
    isLeapYear,
    isValidIsoWeek,
} from "@/modules/timestamp/domain/calendar";
import type { ZonedFields } from "@/modules/timestamp/types";

function fields(year: number, month: number, day: number): ZonedFields {
    return { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 };
}

describe("leap years", () => {
    const cases: readonly (readonly [number, boolean])[] = [
        [2024, true],
        [2025, false],
        [2026, false],
        [1900, false],
        [2000, true],
        [2100, false],
        [1600, true],
        [4, true],
        [0, true],
    ];

    for (const [year, expected] of cases) {
        test(`${year} is ${expected ? "" : "not "}a leap year`, () => {
            expect(isLeapYear(year)).toBe(expected);
        });
    }

    test("February has 29 days only in a leap year", () => {
        expect(getDaysInMonth(2024, 2)).toBe(29);
        expect(getDaysInMonth(2025, 2)).toBe(28);
        expect(getDaysInMonth(1900, 2)).toBe(28);
    });

    test("every other month is fixed", () => {
        expect(getDaysInMonth(2026, 1)).toBe(31);
        expect(getDaysInMonth(2026, 4)).toBe(30);
        expect(getDaysInMonth(2026, 12)).toBe(31);
    });
});

describe("daysFromCivil", () => {
    test("the epoch itself is day zero", () => {
        expect(daysFromCivil(1970, 1, 1)).toBe(0);
    });

    test("counts forwards and backwards", () => {
        expect(daysFromCivil(1970, 1, 2)).toBe(1);
        expect(daysFromCivil(1969, 12, 31)).toBe(-1);
        expect(daysFromCivil(2026, 7, 29)).toBe(20_663);
    });

    test("agrees with Date across four centuries", () => {
        for (let year = 1700; year <= 2100; year += 7) {
            const expected = Date.UTC(year, 6, 15) / 86_400_000;

            expect(daysFromCivil(year, 7, 15)).toBe(expected);
        }
    });

    test("civilFromDays inverts it, including before year 100", () => {
        for (const [year, month, day] of [
            [1, 1, 1],
            [4, 2, 29],
            [99, 12, 31],
            [1582, 10, 15],
            [1970, 1, 1],
            [2026, 7, 29],
            [-1, 6, 15],
        ] as const) {
            expect(civilFromDays(daysFromCivil(year, month, day))).toEqual({ year, month, day });
        }
    });
});

describe("day of year and weekday", () => {
    test("counts from one", () => {
        expect(getDayOfYear(2026, 1, 1)).toBe(1);
        expect(getDayOfYear(2026, 12, 31)).toBe(365);
        expect(getDayOfYear(2024, 12, 31)).toBe(366);
        expect(getDayOfYear(2026, 7, 29)).toBe(210);
    });

    test("numbers Monday as 1 and Sunday as 7", () => {
        // 2026-07-29 is a Wednesday, 1970-01-01 a Thursday.
        expect(getIsoDayOfWeek(2026, 7, 29)).toBe(3);
        expect(getIsoDayOfWeek(1970, 1, 1)).toBe(4);
        expect(getIsoDayOfWeek(2026, 8, 2)).toBe(7);
    });
});

describe("ISO week dates", () => {
    test("assigns the ordinary case", () => {
        expect(getIsoWeek(2026, 7, 29)).toEqual({ week: 31, weekYear: 2026 });
        expect(formatIsoWeekDate(2026, 7, 29)).toBe("2026-W31-3");
    });

    test("early January can belong to the previous week year", () => {
        // 2027-01-01 is a Friday, so it closes out 2026's week 53.
        expect(getIsoWeek(2027, 1, 1)).toEqual({ week: 53, weekYear: 2026 });
    });

    test("late December can belong to the next week year", () => {
        // 2024-12-30 is a Monday, opening 2025's week 1.
        expect(getIsoWeek(2024, 12, 30)).toEqual({ week: 1, weekYear: 2025 });
    });

    test("a long year has 53 weeks and a short one has 52", () => {
        expect(isValidIsoWeek(2026, 53)).toBe(true);
        expect(isValidIsoWeek(2025, 53)).toBe(false);
        expect(isValidIsoWeek(2025, 52)).toBe(true);
        expect(isValidIsoWeek(2026, 0)).toBe(false);
    });

    test("fromIsoWeekDate inverts getIsoWeek", () => {
        for (const [year, month, day] of [
            [2026, 7, 29],
            [2027, 1, 1],
            [2024, 12, 30],
            [2020, 2, 29],
        ] as const) {
            const { week, weekYear } = getIsoWeek(year, month, day);
            const weekday = getIsoDayOfWeek(year, month, day);

            expect(fromIsoWeekDate(weekYear, week, weekday)).toEqual({ year, month, day });
        }
    });
});

describe("ordinal dates", () => {
    test("reads the nth day of the year", () => {
        expect(fromOrdinalDate(2026, 1)).toEqual({ month: 1, day: 1 });
        expect(fromOrdinalDate(2026, 210)).toEqual({ month: 7, day: 29 });
        expect(fromOrdinalDate(2024, 60)).toEqual({ month: 2, day: 29 });
        expect(fromOrdinalDate(2025, 60)).toEqual({ month: 3, day: 1 });
    });
});

describe("buildCalendarFacts", () => {
    test("describes the instant against the reader's today", () => {
        expect(buildCalendarFacts(fields(2026, 7, 29), fields(2026, 7, 26))).toEqual({
            dayOfYear: 210,
            isoWeek: 31,
            isoWeekYear: 2026,
            isoWeekDate: "2026-W31-3",
            quarter: 3,
            daysInMonth: 31,
            leapYear: false,
            dayOffsetFromToday: 3,
        });
    });

    test("counts calendar days, not elapsed hours", () => {
        const justBeforeMidnight: ZonedFields = { ...fields(2026, 7, 29), hour: 23, minute: 59 };
        const justAfterMidnight: ZonedFields = { ...fields(2026, 7, 30), hour: 0, minute: 1 };

        expect(buildCalendarFacts(justAfterMidnight, justBeforeMidnight).dayOffsetFromToday).toBe(
            1,
        );
    });

    test("quarters split the year in four", () => {
        expect([1, 3, 4, 6, 7, 9, 10, 12].map(getQuarter)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    });
});
