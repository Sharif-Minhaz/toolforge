import { describe, expect, test } from "bun:test";

import { addDays, computeAge, computeTotals, nextBirthday } from "../domain/age";
import type { CivilDate } from "../types";

function date(iso: string): CivilDate {
    const [year, month, day] = iso.split("-").map(Number);

    return { year, month, day };
}

/**
 * Produced by `java.time.Period.between` on OpenJDK 21, not by this module:
 * fifteen month-end and leap-day edges, then forty-five random pairs from
 * 1950 to 2065. Python's `relativedelta` disagrees on five of the edges — see
 * `domain/age.ts` for why Java's reading is the one followed.
 */
const JAVA_PERIOD_VECTORS: readonly (readonly [string, string, number, number, number])[] = [
    ["2000-02-29", "2001-02-28", 0, 11, 30],
    ["2000-02-29", "2001-03-01", 1, 0, 1],
    ["2000-02-29", "2004-02-29", 4, 0, 0],
    ["2001-01-31", "2001-02-28", 0, 0, 28],
    ["2001-01-31", "2001-03-01", 0, 1, 1],
    ["2001-01-31", "2001-03-31", 0, 2, 0],
    ["2004-01-30", "2004-02-29", 0, 0, 30],
    ["1995-12-31", "2025-12-30", 29, 11, 30],
    ["1995-12-31", "2025-12-31", 30, 0, 0],
    ["1998-05-12", "2026-11-27", 28, 6, 15],
    ["1990-03-25", "2020-03-25", 30, 0, 0],
    ["1990-03-26", "2020-03-25", 29, 11, 28],
    ["2026-11-27", "2026-11-27", 0, 0, 0],
    ["1999-08-31", "2000-09-30", 1, 0, 30],
    ["1999-10-31", "2000-11-30", 1, 0, 30],
    ["1957-04-20", "1976-10-22", 19, 6, 2],
    ["1958-09-11", "1959-11-18", 1, 2, 7],
    ["2004-09-18", "2034-08-24", 29, 11, 6],
    ["1970-07-02", "1971-08-23", 1, 1, 21],
    ["1974-12-23", "2003-08-16", 28, 7, 24],
    ["2008-07-24", "2013-05-22", 4, 9, 28],
    ["2019-09-01", "2020-10-31", 1, 1, 30],
    ["1958-12-14", "1968-10-08", 9, 9, 24],
    ["1974-08-20", "1998-12-05", 24, 3, 15],
    ["1973-01-10", "2015-02-28", 42, 1, 18],
    ["1984-12-28", "2024-12-17", 39, 11, 19],
    ["2015-04-29", "2055-11-10", 40, 6, 12],
    ["1985-10-08", "1989-09-13", 3, 11, 5],
    ["1994-01-26", "1998-05-15", 4, 3, 19],
    ["1958-08-26", "1961-08-19", 2, 11, 24],
    ["1951-06-23", "1974-09-01", 23, 2, 9],
    ["2018-12-17", "2063-07-21", 44, 7, 4],
    ["1965-04-03", "1994-01-28", 28, 9, 25],
    ["1956-09-13", "1984-09-05", 27, 11, 23],
    ["2009-02-07", "2016-06-15", 7, 4, 8],
    ["1975-10-21", "1987-01-12", 11, 2, 22],
    ["2008-03-31", "2028-04-28", 20, 0, 28],
    ["1960-03-07", "1994-02-08", 33, 11, 1],
    ["2012-07-24", "2026-11-11", 14, 3, 18],
    ["1994-10-06", "1996-02-27", 1, 4, 21],
    ["2000-01-03", "2039-08-09", 39, 7, 6],
    ["2008-10-12", "2031-04-05", 22, 5, 24],
    ["1956-09-09", "1964-12-09", 8, 3, 0],
    ["1973-06-01", "2011-07-29", 38, 1, 28],
    ["1991-12-23", "2017-02-03", 25, 1, 11],
    ["1981-01-12", "2019-10-22", 38, 9, 10],
    ["1962-06-02", "1979-06-29", 17, 0, 27],
    ["1956-01-05", "1963-05-25", 7, 4, 20],
    ["1970-10-05", "2007-03-15", 36, 5, 10],
    ["1962-09-30", "1985-02-16", 22, 4, 17],
    ["2013-10-09", "2048-10-12", 35, 0, 3],
    ["2016-12-15", "2035-01-01", 18, 0, 17],
    ["1961-03-09", "1993-09-14", 32, 6, 5],
    ["1986-06-17", "1988-06-01", 1, 11, 15],
    ["2009-04-26", "2015-08-08", 6, 3, 13],
    ["1984-04-18", "1999-04-06", 14, 11, 19],
    ["1962-12-28", "1964-05-21", 1, 4, 23],
    ["1981-04-03", "1982-02-17", 0, 10, 14],
    ["1955-12-24", "1992-09-25", 36, 9, 1],
    ["1986-12-31", "2031-01-09", 44, 0, 9],
];

describe("computeAge", () => {
    test.each(JAVA_PERIOD_VECTORS)(
        "%s to %s matches java.time.Period",
        (from, to, years, months, days) => {
            expect(computeAge(date(from), date(to))).toEqual({ years, months, days });
        },
    );

    test("a leap-day child is not a year old until 1 March in a common year", () => {
        expect(computeAge(date("2000-02-29"), date("2001-02-28")).years).toBe(0);
        expect(computeAge(date("2000-02-29"), date("2001-03-01")).years).toBe(1);
    });

    test("never goes backwards as the day moves on", () => {
        const birth = date("1999-01-31");
        let previous = -1;

        for (let offset = 0; offset < 800; offset += 1) {
            const age = computeAge(birth, addDays(birth, offset));
            const rank = age.years * 10_000 + age.months * 100 + age.days;

            expect(rank).toBeGreaterThan(previous);
            previous = rank;
        }
    });
});

describe("computeTotals", () => {
    test("counts days, whole weeks and completed months", () => {
        expect(computeTotals(date("2026-01-01"), date("2026-03-01"))).toEqual({
            months: 2,
            weeks: 8,
            weekDays: 3,
            days: 59,
        });
    });
});

describe("nextBirthday", () => {
    test("counts down to the next one", () => {
        expect(nextBirthday(date("1998-05-12"), date("2026-11-27"))).toEqual({
            date: date("2027-05-12"),
            daysUntil: 166,
            turning: 29,
        });
    });

    test("is today on the birthday itself", () => {
        expect(nextBirthday(date("1998-05-12"), date("2026-05-12"))).toEqual({
            date: date("2026-05-12"),
            daysUntil: 0,
            turning: 28,
        });
    });

    test("lands on 1 March for 29 February in a common year", () => {
        expect(nextBirthday(date("2000-02-29"), date("2026-11-27")).date).toEqual(
            date("2027-03-01"),
        );
        expect(nextBirthday(date("2000-02-29"), date("2027-03-01")).daysUntil).toBe(0);
        expect(nextBirthday(date("2000-02-29"), date("2028-01-01")).date).toEqual(
            date("2028-02-29"),
        );
    });

    test("the day of birth is not a birthday", () => {
        expect(nextBirthday(date("2026-11-27"), date("2026-11-27"))).toEqual({
            date: date("2027-11-27"),
            daysUntil: 365,
            turning: 1,
        });
    });
});
