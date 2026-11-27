import { describe, expect, test } from "bun:test";

import { addDays, computeAge } from "../domain/age";
import {
    checkEligibility,
    earliestBirthYoungEnough,
    latestBirthOldEnough,
    validateLimits,
} from "../domain/eligibility";
import type { CivilDate } from "../types";

function date(iso: string): CivilDate {
    const [year, month, day] = iso.split("-").map(Number);

    return { year, month, day };
}

const CUTOFF = date("2026-11-27");

describe("the maximum", () => {
    test("still passes on the thirtieth birthday, and fails the day after", () => {
        const limits = { minYears: null, maxYears: 30 };

        expect(checkEligibility(date("1996-11-27"), CUTOFF, limits, null).eligible).toBe(true);
        expect(checkEligibility(date("1996-11-26"), CUTOFF, limits, null).eligible).toBe(false);
    });

    test("names the earliest date of birth that passes", () => {
        expect(earliestBirthYoungEnough(CUTOFF, 30)).toEqual(date("1996-11-27"));
    });

    test("treats 1 March as a leap-day child's birthday in a common year", () => {
        const limits = { minYears: null, maxYears: 30 };
        const leapDay = date("2000-02-29");

        expect(checkEligibility(leapDay, date("2030-03-01"), limits, null).eligible).toBe(true);
        expect(checkEligibility(leapDay, date("2030-03-02"), limits, null).eligible).toBe(false);
    });
});

describe("the minimum", () => {
    test("passes on the eighteenth birthday and not the day before", () => {
        const limits = { minYears: 18, maxYears: null };

        expect(checkEligibility(date("2008-11-27"), CUTOFF, limits, null).eligible).toBe(true);
        expect(checkEligibility(date("2008-11-28"), CUTOFF, limits, null).eligible).toBe(false);
        expect(latestBirthOldEnough(CUTOFF, 18)).toEqual(date("2008-11-27"));
    });

    test("does not make a leap-day child 18 on 28 February", () => {
        const limits = { minYears: 18, maxYears: null };

        expect(
            checkEligibility(date("2008-02-29"), date("2026-02-28"), limits, null).eligible,
        ).toBe(false);
        expect(
            checkEligibility(date("2008-02-29"), date("2026-03-01"), limits, null).eligible,
        ).toBe(true);
    });
});

/**
 * The 2020 notices: a circular published under them counts the maximum as of
 * 25 March 2020 as well as on its own date. The minimum is not relaxed.
 */
describe("a relaxation date", () => {
    const relaxation = date("2020-03-25");
    const limits = { minYears: 18, maxYears: 30 };

    test("lets in somebody who was within the maximum on that date", () => {
        const result = checkEligibility(date("1990-03-25"), CUTOFF, limits, relaxation);

        expect(result.max?.passes).toBe(false);
        expect(result.relaxedMax).toMatchObject({ passes: true, born: date("1990-03-25") });
        expect(result.eligible).toBe(true);
        expect(result.passedByRelaxation).toBe(true);
    });

    test("does not let in somebody already over it then", () => {
        const result = checkEligibility(date("1990-03-24"), CUTOFF, limits, relaxation);

        expect(result.eligible).toBe(false);
        expect(result.passedByRelaxation).toBe(false);
    });

    test("does not relax the minimum", () => {
        const result = checkEligibility(date("2010-01-01"), CUTOFF, limits, relaxation);

        expect(result.min?.passes).toBe(false);
        expect(result.eligible).toBe(false);
    });

    test("is not credited when the main date already passes", () => {
        const result = checkEligibility(date("2000-01-01"), CUTOFF, limits, relaxation);

        expect(result.eligible).toBe(true);
        expect(result.passedByRelaxation).toBe(false);
    });
});

/**
 * The edges are found by a short search from an estimate, which is only right
 * if the checks are monotone in the birth date. Brute force every cut-off over
 * two leap cycles against every birth date near the edge.
 */
describe("edge search", () => {
    test("agrees with the age figure itself for every cut-off across eight years", () => {
        for (let offset = 0; offset < 8 * 366; offset += 1) {
            const cutoff = addDays(date("2024-01-01"), offset);
            const latest = latestBirthOldEnough(cutoff, 18);
            const earliest = earliestBirthYoungEnough(cutoff, 30);

            expect(computeAge(latest, cutoff).years).toBeGreaterThanOrEqual(18);
            expect(computeAge(addDays(latest, 1), cutoff).years).toBeLessThan(18);

            const dayBefore = addDays(cutoff, -1);

            expect(computeAge(earliest, dayBefore).years).toBeLessThan(30);
            expect(computeAge(addDays(earliest, -1), dayBefore).years).toBe(30);
        }
    });
});

describe("validateLimits", () => {
    test("names each refusal", () => {
        expect(validateLimits({ minYears: 18, maxYears: 30 })).toBeNull();
        expect(validateLimits({ minYears: null, maxYears: null })).toBeNull();
        expect(validateLimits({ minYears: 31, maxYears: 30 })).toBe("min_above_max");
        expect(validateLimits({ minYears: -1, maxYears: null })).toBe("limit_out_of_range");
        expect(validateLimits({ minYears: null, maxYears: 100 })).toBe("limit_out_of_range");
        expect(validateLimits({ minYears: 18.5, maxYears: null })).toBe("limit_out_of_range");
    });
});
