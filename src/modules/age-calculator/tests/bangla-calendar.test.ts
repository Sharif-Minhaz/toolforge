import { describe, expect, test } from "bun:test";

import { civilFromDays, daysFromCivil } from "@/modules/tools/domain/calendar";
import {
    fromBanglaDate,
    getBanglaMonthLength,
    isBanglaLeapYear,
    toBanglaDate,
} from "../domain/bangla-calendar";

function bangla(year: number, month: number, day: number) {
    return toBanglaDate({ year, month, day });
}

/**
 * The national days the 2019 revision was made to fix, as Bangla Academy and
 * the press reported them: 21 February on 8 Falgun, 26 March on 12 Chaitra,
 * 16 December on 1 Poush, and Pohela Falgun on 14 February. Under the 1987
 * calendar the first and third were 9 Falgun and 2 Poush — the reason for the
 * change.
 */
describe("the 2019 revision, in force from 1426 BS", () => {
    test("pins the national days", () => {
        expect(bangla(2020, 2, 21)).toMatchObject({ year: 1426, month: 11, day: 8, rule: "2019" });
        expect(bangla(2021, 3, 26)).toMatchObject({ year: 1427, month: 12, day: 12 });
        expect(bangla(2019, 12, 16)).toMatchObject({ year: 1426, month: 9, day: 1 });
        expect(bangla(2025, 12, 16)).toMatchObject({ year: 1432, month: 9, day: 1 });
        expect(bangla(2024, 2, 14)).toMatchObject({ year: 1430, month: 11, day: 1 });
    });

    test("starts every year on 14 April", () => {
        for (let year = 2019; year <= 2100; year += 1) {
            expect(bangla(year, 4, 14)).toMatchObject({ year: year - 593, month: 1, day: 1 });
        }
    });

    test("gives Falgun 29 days, and 30 when its February has a 29th", () => {
        expect(getBanglaMonthLength(1431, 11)).toBe(29);
        expect(getBanglaMonthLength(1430, 11)).toBe(30);
        expect(isBanglaLeapYear(1430)).toBe(true);
        expect(bangla(2024, 3, 14)).toMatchObject({ year: 1430, month: 11, day: 30 });
        expect(bangla(2025, 3, 14)).toMatchObject({ year: 1431, month: 11, day: 29 });
        expect(bangla(2025, 3, 15)).toMatchObject({ year: 1431, month: 12, day: 1 });
    });

    test("makes Boishakh to Ashwin long", () => {
        expect(
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((m) => getBanglaMonthLength(1433, m)),
        ).toEqual([31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30]);
    });

    test("puts today's date where the published calendar does", () => {
        expect(bangla(2026, 11, 27)).toMatchObject({ year: 1433, month: 8, day: 12 });
    });
});

describe("the 1987 revision, 1394 to 1425 BS", () => {
    test("is what dates of that period convert under", () => {
        expect(bangla(2000, 12, 16)).toMatchObject({ year: 1407, month: 9, day: 2, rule: "1987" });
        expect(bangla(2000, 2, 21)).toMatchObject({ year: 1406, month: 11, day: 9 });
        expect(bangla(2019, 2, 13)).toMatchObject({ year: 1425, month: 11, day: 1 });
    });

    test("gives Falgun 30 days, and 31 in a leap year", () => {
        expect(getBanglaMonthLength(1421, 11)).toBe(30);
        expect(getBanglaMonthLength(1422, 11)).toBe(31);
        expect(getBanglaMonthLength(1407, 6)).toBe(30);
        expect(bangla(2016, 3, 14)).toMatchObject({ year: 1422, month: 11, day: 31 });
    });

    test("hands over to the 2019 rule on 1 Boishakh 1426", () => {
        expect(bangla(2019, 4, 13)).toMatchObject({ year: 1425, month: 12, day: 30, rule: "1987" });
        expect(bangla(2019, 4, 14)).toMatchObject({ year: 1426, month: 1, day: 1, rule: "2019" });
    });

    test("flags dates before 1394 BS as computed backwards", () => {
        expect(bangla(1987, 4, 13)).toMatchObject({ year: 1393, beforeReform: true });
        expect(bangla(1987, 4, 14)).toMatchObject({ year: 1394, beforeReform: false });
    });
});

describe("round trips", () => {
    test("every day from 1900 to 2100 comes back to itself", () => {
        const first = daysFromCivil(1900, 1, 1);
        const last = daysFromCivil(2100, 12, 31);

        for (let day = first; day <= last; day += 1) {
            const civil = civilFromDays(day);
            const converted = toBanglaDate(civil);

            expect(fromBanglaDate(converted.year, converted.month, converted.day)).toEqual(civil);
        }
    });

    test("refuses a day the month does not have", () => {
        expect(fromBanglaDate(1431, 11, 30)).toBeNull();
        expect(fromBanglaDate(1430, 11, 30)).not.toBeNull();
        expect(fromBanglaDate(1433, 7, 31)).toBeNull();
        expect(fromBanglaDate(1433, 13, 1)).toBeNull();
        expect(fromBanglaDate(1433, 1, 0)).toBeNull();
    });
});
