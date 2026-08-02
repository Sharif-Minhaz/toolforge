import { describe, expect, test } from "bun:test";

import { ATTACK_GUESSES_PER_SECOND } from "@/modules/password/domain/constants";
import {
    AGE_OF_UNIVERSE_YEARS,
    averageGuessSeconds,
    estimateCrackTime,
    roundToTwoSignificantDigits,
} from "@/modules/password/domain/crack-time";
import { ATTACK_MODELS } from "@/modules/password/types";

describe("roundToTwoSignificantDigits", () => {
    test("keeps two figures at any magnitude", () => {
        expect(roundToTwoSignificantDigits(1234)).toBe(1200);
        expect(roundToTwoSignificantDigits(5.4976)).toBe(5.5);
        expect(roundToTwoSignificantDigits(66.72)).toBe(67);
        expect(roundToTwoSignificantDigits(0.0456)).toBe(0.046);
        expect(roundToTwoSignificantDigits(9999)).toBe(10000);
        expect(roundToTwoSignificantDigits(4.1e20)).toBe(4.1e20);
    });

    test("leaves no float dust behind", () => {
        // 3.9000000000000004 is not two significant figures by any reading.
        expect(roundToTwoSignificantDigits(3.9024)).toBe(3.9);
        expect(roundToTwoSignificantDigits(1.4083)).toBe(1.4);
    });

    test("does not invent a figure for zero or a non-number", () => {
        expect(roundToTwoSignificantDigits(0)).toBe(0);
        expect(roundToTwoSignificantDigits(Number.POSITIVE_INFINITY)).toBe(0);
        expect(roundToTwoSignificantDigits(Number.NaN)).toBe(0);
    });
});

describe("averageGuessSeconds", () => {
    test("searches half the keyspace, not all of it", () => {
        // 41 bits is 2⁴¹ candidates; the average find is after 2⁴⁰ of them.
        expect(averageGuessSeconds(41, "throttled")).toBe(2 ** 40 / 1e2);
    });

    test("divides by the rate the chosen model assumes", () => {
        for (const model of ATTACK_MODELS) {
            expect(averageGuessSeconds(60, model)).toBe(2 ** 59 / ATTACK_GUESSES_PER_SECOND[model]);
        }
    });
});

describe("estimateCrackTime", () => {
    test("says instant when the search takes under a second", () => {
        expect(estimateCrackTime(0, "md5")).toEqual({ kind: "instant" });
        // A six-digit PIN against a leaked fast hash: 2^18.9 / 10¹².
        expect(estimateCrackTime(19.93, "md5")).toEqual({ kind: "instant" });
    });

    test("climbs the ladder to the largest unit that fits", () => {
        const rate = ATTACK_GUESSES_PER_SECOND.throttled;

        expect(estimateCrackTime(Math.log2(2 * 90 * rate), "throttled")).toMatchObject({
            unit: "minutes",
            value: 1.5,
        });
        expect(estimateCrackTime(Math.log2(2 * 7200 * rate), "throttled")).toMatchObject({
            unit: "hours",
            value: 2,
        });
        expect(estimateCrackTime(Math.log2(2 * 5 * 86400 * rate), "throttled")).toMatchObject({
            unit: "days",
            value: 5,
        });
    });

    test("a forty-bit secret falls in seconds to a leaked fast hash", () => {
        expect(estimateCrackTime(40, "sha256")).toEqual({
            kind: "duration",
            unit: "seconds",
            value: 5.5,
            universeMultiple: null,
        });
    });

    test("a sixty-bit secret buys about two months against the same attacker", () => {
        expect(estimateCrackTime(60, "sha256")).toMatchObject({ unit: "months", value: 2.2 });
    });

    test("promotes a figure that rounding carried into the next unit", () => {
        const rate = ATTACK_GUESSES_PER_SECOND.throttled;
        const seconds = (value: number) => Math.log2(2 * value * rate);

        // 59.8 seconds rounds to "60 seconds", which is a minute.
        expect(estimateCrackTime(seconds(59.8), "throttled")).toMatchObject({
            unit: "minutes",
            value: 1,
        });
        // 23.9 hours rounds to "24 hours", which is a day.
        expect(estimateCrackTime(seconds(23.9 * 3600), "throttled")).toMatchObject({
            unit: "days",
            value: 1,
        });
        // 11.99 months rounds to "12 months", which is a year.
        expect(
            estimateCrackTime(seconds(11.99 * ((365.25 * 86400) / 12)), "throttled"),
        ).toMatchObject({ unit: "years", value: 1 });
    });

    test("leaves a figure that only rounds within its own unit alone", () => {
        const rate = ATTACK_GUESSES_PER_SECOND.throttled;

        // A month is 30.44 days, so 29.8 days is genuinely still days.
        expect(estimateCrackTime(Math.log2(2 * 29.8 * 86400 * rate), "throttled")).toMatchObject({
            unit: "days",
            value: 30,
        });
    });

    test("says how many times the age of the universe a figure comes to", () => {
        const result = estimateCrackTime(128, "sha256");

        expect(result.kind).toBe("duration");

        if (result.kind !== "duration") {
            return;
        }

        expect(result.unit).toBe("years");
        expect(result.value).toBeGreaterThan(AGE_OF_UNIVERSE_YEARS);
        expect(result.universeMultiple).toBe(
            roundToTwoSignificantDigits(result.value / AGE_OF_UNIVERSE_YEARS),
        );
    });

    test("leaves the multiple off a figure that fits inside the universe", () => {
        // ~187 years at 10¹¹ guesses a second.
        expect(estimateCrackTime(70, "sha256")).toMatchObject({
            unit: "years",
            universeMultiple: null,
        });
    });

    test("reports a magnitude the names have run out for rather than giving up", () => {
        // A 128-character random password: no name reaches 10²³³, but the
        // figure is still exact enough to print as a power of ten.
        expect(estimateCrackTime(838, "md5")).toMatchObject({ unit: "years" });
    });

    test("gives up only when the keyspace has outrun a double", () => {
        expect(estimateCrackTime(100_000, "md5")).toEqual({ kind: "beyond" });
    });

    test("the attacker model moves the answer by orders of magnitude", () => {
        const throttled = estimateCrackTime(60, "throttled");
        const fast = estimateCrackTime(60, "md5");

        // Ten orders of magnitude in the rate: 180 million years becomes a week.
        expect(throttled).toMatchObject({ unit: "years", value: 180_000_000 });
        expect(fast).toMatchObject({ unit: "days", value: 6.7 });
    });
});
