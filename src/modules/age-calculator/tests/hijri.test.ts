import { describe, expect, test } from "bun:test";

import { civilFromDays, daysFromCivil } from "@/modules/tools/domain/calendar";
import { fromHijriDate, getHijriMonthLength, toHijriDate } from "../domain/hijri";

/**
 * ICU's `islamic-civil` is the same tabular calendar, implemented by somebody
 * else. Both Bun and Node ship it; the cross-check runs only where it exists,
 * and says so rather than passing silently.
 */
const icu = (() => {
    try {
        const format = new Intl.DateTimeFormat("en-u-ca-islamic-civil-nu-latn", {
            timeZone: "UTC",
            year: "numeric",
            month: "numeric",
            day: "numeric",
        });

        return format.resolvedOptions().calendar === "islamic-civil" ? format : null;
    } catch {
        return null;
    }
})();

function icuHijri(format: Intl.DateTimeFormat, dayNumber: number) {
    const parts = format.formatToParts(new Date(dayNumber * 86_400_000));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);

    return { year: read("year"), month: read("month"), day: read("day") };
}

describe("toHijriDate", () => {
    test("this engine ships islamic-civil, so the cross-check below is real", () => {
        expect(icu).not.toBeNull();
    });

    test("agrees with ICU's islamic-civil on every day from 1950 to 2060", () => {
        if (icu === null) {
            return;
        }

        const first = daysFromCivil(1950, 1, 1);
        const last = daysFromCivil(2060, 12, 31);

        for (let day = first; day <= last; day += 1) {
            expect(toHijriDate(civilFromDays(day))).toEqual(icuHijri(icu, day));
        }
    });

    test("shifts by the adjustment", () => {
        const today = { year: 2026, month: 11, day: 27 };

        expect(toHijriDate(today)).toEqual({ year: 1448, month: 6, day: 16 });
        expect(toHijriDate(today, -1)).toEqual({ year: 1448, month: 6, day: 15 });
        expect(toHijriDate(today, 2)).toEqual({ year: 1448, month: 6, day: 18 });
    });
});

describe("fromHijriDate", () => {
    test("inverts toHijriDate, adjustment included", () => {
        const first = daysFromCivil(1900, 1, 1);
        const last = daysFromCivil(2100, 12, 31);

        for (let day = first; day <= last; day += 3) {
            const civil = civilFromDays(day);

            for (const adjustment of [-2, 0, 1]) {
                const hijri = toHijriDate(civil, adjustment);

                expect(fromHijriDate(hijri.year, hijri.month, hijri.day, adjustment)).toEqual(
                    civil,
                );
            }
        }
    });

    test("refuses a day the month does not have", () => {
        expect(getHijriMonthLength(1448, 2)).toBe(29);
        expect(fromHijriDate(1448, 2, 30)).toBeNull();
        expect(fromHijriDate(1448, 13, 1)).toBeNull();
        expect(fromHijriDate(0, 1, 1)).toBeNull();
    });
});
