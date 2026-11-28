import { describe, expect, test } from "bun:test";

import { calculateAge } from "../domain/calculate";
import { BODY_RATES, lifetimeBodyStats } from "../domain/body-stats";
import { NO_LIMITS } from "../domain/constants";

describe("the published rates", () => {
    // Pinned to the sources' own wording, so an edit that drifts from them fails here.
    test("match the figures their sources state", () => {
        expect(BODY_RATES.heartbeatsPerDay).toBe(100_000);
        expect(BODY_RATES.bloodLitresPerMinute).toBe(5.7);
        expect(BODY_RATES.breathsPerDay).toBe(23_000);
        expect(BODY_RATES.oxygenKgPerDay).toBe(0.72);
        expect(BODY_RATES.carbonDioxideKgPerDay).toBe(0.91);
        expect(BODY_RATES.hairsShedPerDay).toEqual({ low: 50, high: 100 });
        expect(BODY_RATES.hairMmPerDay).toBe(0.35);
        expect(BODY_RATES.nailMmPer30Days).toBe(3.47);
    });
});

describe("lifetimeBodyStats", () => {
    test("is zero on the day of birth", () => {
        expect(lifetimeBodyStats(0)).toEqual({
            days: 0,
            heartbeats: 0,
            bloodLitres: 0,
            breaths: 0,
            oxygenKg: 0,
            carbonDioxideKg: 0,
            hairsShed: { low: 0, high: 0 },
            hairGrownMm: 0,
            nailGrownMm: 0,
        });
    });

    // 9,151 days, worked by hand: 9151 × 1440 × 5.7 = 75,111,408 L;
    // 9151 × 3.47 / 30 = 1,058.4657 mm.
    test("sums each rate over the days lived", () => {
        const stats = lifetimeBodyStats(9151);

        expect(stats.heartbeats).toBe(915_100_000);
        expect(stats.bloodLitres).toBe(75_111_408);
        expect(stats.breaths).toBe(210_473_000);
        expect(stats.oxygenKg).toBeCloseTo(6588.72, 6);
        expect(stats.carbonDioxideKg).toBeCloseTo(8327.41, 6);
        expect(stats.hairsShed).toEqual({ low: 457_550, high: 915_100 });
        expect(stats.hairGrownMm).toBeCloseTo(3202.85, 6);
        expect(stats.nailGrownMm).toBeCloseTo(1058.4657, 4);
    });

    test("keeps the hair range ordered", () => {
        const { hairsShed } = lifetimeBodyStats(365);

        expect(hairsShed.low).toBeLessThan(hairsShed.high);
    });

    test("refuses a day count that is not a whole, non-negative number", () => {
        expect(() => lifetimeBodyStats(-1)).toThrow(RangeError);
        expect(() => lifetimeBodyStats(1.5)).toThrow(RangeError);
    });
});

describe("calculateAge", () => {
    test("counts the body figures over the same days as the total", () => {
        const result = calculateAge({
            birth: "08/11/2001",
            reference: "28/11/2026",
            limits: NO_LIMITS,
            relaxation: "",
            hijriAdjustment: 0,
        });

        if (!result.ok) {
            throw new Error(`expected an age, got ${result.reason}`);
        }

        expect(result.totals.days).toBe(9151);
        expect(result.body).toEqual(lifetimeBodyStats(9151));
    });
});
