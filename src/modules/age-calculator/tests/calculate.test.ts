import { describe, expect, test } from "bun:test";

import { calculateAge, convertDate } from "../domain/calculate";
import { NO_LIMITS } from "../domain/constants";
import { todayInBangladesh } from "../domain/today";
import type { AgeRequest } from "../types";

function request(overrides: Partial<AgeRequest>): AgeRequest {
    return {
        birth: "12/05/1998",
        reference: "27/11/2026",
        limits: NO_LIMITS,
        relaxation: "",
        hijriAdjustment: 0,
        ...overrides,
    };
}

describe("calculateAge", () => {
    test("reads both dates and names them in every calendar", () => {
        const result = calculateAge(request({}));

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.age).toEqual({ years: 28, months: 6, days: 15 });
        expect(result.birth.iso).toBe("1998-05-12");
        // A Tuesday, and 29 Boishakh 1405 under the 1987 calendar then in force.
        expect(result.birth.weekday).toBe(2);
        expect(result.birth.bangla).toMatchObject({ year: 1405, month: 1, day: 29, rule: "1987" });
        expect(result.reference.bangla).toMatchObject({ year: 1433, month: 8, day: 12 });
        expect(result.eligibility).toBeNull();
        expect(result.relaxation).toBeNull();
    });

    test("checks limits only when one is set", () => {
        const result = calculateAge(request({ limits: { minYears: 18, maxYears: 30 } }));

        expect(result.ok && result.eligibility?.eligible).toBe(true);
    });

    test("applies the Hijri adjustment to every date it names", () => {
        const plain = calculateAge(request({}));
        const shifted = calculateAge(request({ hijriAdjustment: -1 }));

        expect(plain.ok && shifted.ok).toBe(true);

        if (plain.ok && shifted.ok) {
            expect(shifted.reference.hijri.day).toBe(plain.reference.hijri.day - 1);
        }
    });

    test("keeps each refusal's own name", () => {
        expect(calculateAge(request({ birth: "" }))).toEqual({
            ok: false,
            reason: "invalid_birth",
            dateReason: "empty",
        });
        expect(calculateAge(request({ birth: "31/04/1998" }))).toEqual({
            ok: false,
            reason: "invalid_birth",
            dateReason: "invalid_date",
        });
        expect(calculateAge(request({ reference: "tomorrow" }))).toEqual({
            ok: false,
            reason: "invalid_reference",
            dateReason: "invalid_format",
        });
        expect(calculateAge(request({ relaxation: "25/03/1820" }))).toEqual({
            ok: false,
            reason: "invalid_relaxation",
            dateReason: "out_of_range",
        });
        expect(calculateAge(request({ birth: "28/11/2026" }))).toEqual({
            ok: false,
            reason: "birth_after_reference",
        });
        expect(calculateAge(request({ limits: { minYears: 35, maxYears: 30 } }))).toEqual({
            ok: false,
            reason: "min_above_max",
        });
    });

    test("reads the relaxation date when one is given", () => {
        const result = calculateAge(
            request({
                birth: "25/03/1990",
                relaxation: "25-03-2020",
                limits: { minYears: null, maxYears: 30 },
            }),
        );

        expect(result.ok && result.relaxation?.iso).toBe("2020-03-25");
        expect(result.ok && result.eligibility?.passedByRelaxation).toBe(true);
    });
});

describe("convertDate", () => {
    test("goes from Bangla to the other two", () => {
        const result = convertDate({ calendar: "bangla", year: 1426, month: 11, day: 8 });

        expect(result.ok && result.facts.iso).toBe("2020-02-21");
    });

    test("goes from Hijri, adjustment included", () => {
        const plain = convertDate({ calendar: "hijri", year: 1448, month: 6, day: 16 });
        const shifted = convertDate({ calendar: "hijri", year: 1448, month: 6, day: 16 }, -1);

        expect(plain.ok && plain.facts.iso).toBe("2026-11-27");
        expect(shifted.ok && shifted.facts.iso).toBe("2026-11-28");
    });

    test("refuses a day that does not exist, and a year out of range", () => {
        expect(convertDate({ calendar: "gregorian", year: 2025, month: 2, day: 29 })).toEqual({
            ok: false,
            reason: "invalid_date",
        });
        expect(convertDate({ calendar: "bangla", year: 1431, month: 11, day: 30 })).toEqual({
            ok: false,
            reason: "invalid_date",
        });
        expect(convertDate({ calendar: "gregorian", year: 2200, month: 1, day: 1 })).toEqual({
            ok: false,
            reason: "out_of_range",
        });
    });
});

describe("todayInBangladesh", () => {
    test("is already tomorrow in Dhaka at 20:00 UTC", () => {
        expect(todayInBangladesh(Date.UTC(2026, 10, 27, 20, 0))).toEqual({
            year: 2026,
            month: 11,
            day: 28,
        });
        expect(todayInBangladesh(Date.UTC(2026, 10, 27, 17, 59))).toEqual({
            year: 2026,
            month: 11,
            day: 27,
        });
    });
});
