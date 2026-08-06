import { describe, expect, test } from "bun:test";

import { exceedsPayloadBudget } from "@/modules/tools/domain/payload-size";

describe("exceedsPayloadBudget", () => {
    test("a small value fits a generous budget", () => {
        expect(exceedsPayloadBudget({ a: 1, b: "hello" }, 1_000)).toBe(false);
        expect(exceedsPayloadBudget(null, 1_000)).toBe(false);
        expect(exceedsPayloadBudget([], 1_000)).toBe(false);
    });

    test("a long string is refused", () => {
        expect(exceedsPayloadBudget({ text: "a".repeat(5_000) }, 1_000)).toBe(true);
    });

    test("many empty values still have a size", () => {
        // The whole reason for a per-value charge: a million nulls serialise to
        // megabytes and would measure zero without it.
        expect(
            exceedsPayloadBudget(
                Array.from({ length: 10_000 }, () => null),
                1_000,
            ),
        ).toBe(true);
    });

    test("keys count, not only values", () => {
        const wide = Object.fromEntries(
            Array.from({ length: 200 }, (_, index) => [`key-${index}`.padEnd(40, "x"), 0]),
        );

        expect(exceedsPayloadBudget(wide, 1_000)).toBe(true);
    });

    test("a deeply nested value does not overflow the stack", () => {
        let deep: unknown = "leaf";

        for (let index = 0; index < 100_000; index += 1) {
            deep = [deep];
        }

        // The point is that it answers at all rather than throwing.
        expect(exceedsPayloadBudget(deep, 1_000)).toBe(true);
    });

    test("a cycle terminates instead of hanging", () => {
        const node: Record<string, unknown> = { name: "loop" };
        node.self = node;

        expect(exceedsPayloadBudget(node, 1_000)).toBe(false);
    });

    test("an unusable budget refuses rather than admitting everything", () => {
        for (const budget of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(exceedsPayloadBudget({}, budget)).toBe(true);
        }
    });

    test("stops early — a payload far past the budget costs no more than one just over", () => {
        const huge = Array.from({ length: 500_000 }, (_, index) => ({
            index,
            text: "x".repeat(64),
        }));

        const started = performance.now();
        expect(exceedsPayloadBudget(huge, 1_000)).toBe(true);
        // Generous by three orders of magnitude; a full walk of this is ~30 M
        // units and would not land anywhere near it.
        expect(performance.now() - started).toBeLessThan(5);
    });
});
