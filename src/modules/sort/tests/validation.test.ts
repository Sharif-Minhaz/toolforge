import { describe, expect, test } from "bun:test";

import { DEFAULT_SORT_OPTIONS, MAX_START_NUMBER } from "@/modules/sort/domain/constants";
import { sortOptionsSchema, sortSearchParamsSchema } from "@/modules/sort/validation/sort-options";

describe("sortOptionsSchema", () => {
    test("accepts the defaults", () => {
        expect(sortOptionsSchema.safeParse(DEFAULT_SORT_OPTIONS).success).toBe(true);
    });

    test("refuses an order, key, format or style it does not offer", () => {
        for (const patch of [
            { order: "sideways" },
            { sortKey: "vibes" },
            { format: "table" },
            { bulletStyle: "star" },
            { numberStyle: "greek" },
            { splitMode: "sentence" },
        ]) {
            expect(sortOptionsSchema.safeParse({ ...DEFAULT_SORT_OPTIONS, ...patch }).success).toBe(
                false,
            );
        }
    });

    test("keeps the starting ordinal inside its range and whole", () => {
        for (const startNumber of [-1, MAX_START_NUMBER + 1, 1.5]) {
            expect(
                sortOptionsSchema.safeParse({ ...DEFAULT_SORT_OPTIONS, startNumber }).success,
            ).toBe(false);
        }

        expect(
            sortOptionsSchema.safeParse({ ...DEFAULT_SORT_OPTIONS, startNumber: 0 }).success,
        ).toBe(true);
    });
});

describe("sortSearchParamsSchema", () => {
    test("reads a shared link", () => {
        const parsed = sortSearchParamsSchema.parse({
            text: "b\na",
            order: "descending",
            format: "bullet",
            split: "line",
        });

        expect(parsed).toEqual({
            text: "b\na",
            order: "descending",
            format: "bullet",
            split: "line",
        });
    });

    /**
     * Each field catches on its own, so one bad value in a shared link opens the
     * page on a default rather than throwing the whole page away.
     */
    test("degrades one malformed field without losing the others", () => {
        const parsed = sortSearchParamsSchema.parse({
            text: "b\na",
            order: "sideways",
            format: "bullet",
        });

        expect(parsed).toEqual({
            text: "b\na",
            order: undefined,
            format: "bullet",
            split: undefined,
        });
    });

    test("drops a shared text longer than a link should carry", () => {
        expect(sortSearchParamsSchema.parse({ text: "x".repeat(5000) }).text).toBeUndefined();
    });
});
