import { describe, expect, test } from "bun:test";

import {
    chooseReference,
    referenceArea,
    roundedCount,
    tileColumns,
} from "@/modules/land-measurement/domain/reference";

describe("chooseReference", () => {
    test("one square metre is a share of a single bed", () => {
        const comparison = chooseReference(1);

        expect(comparison.object).toBe("single-bed");
        expect(comparison.ratio).toBeCloseTo(1 / 1.71, 9);
    });

    test("five কাঠা (334 m²) is about 1.3 tennis courts", () => {
        const comparison = chooseReference(334.45);

        expect(comparison.object).toBe("tennis-court");
        expect(comparison.ratio).toBeCloseTo(334.45 / referenceArea("tennis-court"), 9);
    });

    test("picks the largest object the plot is at least as big as", () => {
        expect(chooseReference(12.5).object).toBe("parking-space");
        expect(chooseReference(12.49).object).toBe("single-bed");
        expect(chooseReference(81.74).object).toBe("badminton-court");
        expect(chooseReference(800).object).toBe("futsal-court");
        expect(chooseReference(7_140).object).toBe("football-pitch");
        expect(chooseReference(1e9).object).toBe("football-pitch");
    });

    test("no step on the ladder is more than about nine of the one below", () => {
        const areas = [
            "single-bed",
            "parking-space",
            "badminton-court",
            "tennis-court",
            "futsal-court",
            "football-pitch",
        ] as const;

        for (let index = 1; index < areas.length; index++) {
            expect(referenceArea(areas[index]) / referenceArea(areas[index - 1])).toBeLessThan(9);
        }
    });

    test("zero is zero beds", () => {
        expect(chooseReference(0)).toEqual({ object: "single-bed", ratio: 0 });
    });
});

describe("roundedCount", () => {
    test("one decimal under ten, whole numbers above", () => {
        // One কানি is 1,605 m²: 2.007 futsal courts, which is said and drawn as 2.
        expect(roundedCount(2.007)).toBe(2);
        expect(roundedCount(3.24)).toBe(3.2);
        expect(roundedCount(9.96)).toBe(10);
        expect(roundedCount(14.6)).toBe(15);
    });
});

describe("tileColumns", () => {
    test("two futsal courts stack into a 40 m square", () => {
        expect(tileColumns(2, 40, 20)).toBe(1);
    });

    test("six parking spaces sit two across, 10 × 7.5 m", () => {
        expect(tileColumns(6, 5, 2.5)).toBe(2);
    });

    test("one object is one column", () => {
        expect(tileColumns(1, 23.77, 10.97)).toBe(1);
    });
});
