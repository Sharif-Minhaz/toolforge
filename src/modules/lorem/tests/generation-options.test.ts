import { describe, expect, test } from "bun:test";

import { MAX_LOREM_PARAGRAPHS } from "@/modules/lorem/domain/constants";
import { loremSearchParamsSchema } from "@/modules/lorem/validation/generation-options";

describe("loremSearchParamsSchema", () => {
    test("reads a fully specified link", () => {
        const parsed = loremSearchParamsSchema.parse({
            source: "kafka",
            unit: "characters",
            amount: "500",
            paragraphs: "4",
            opener: "true",
            format: "html",
        });

        expect(parsed).toEqual({
            source: "kafka",
            unit: "characters",
            amount: 500,
            paragraphs: 4,
            opener: true,
            format: "html",
        });
    });

    test("drops one bad field instead of failing the whole link", () => {
        const parsed = loremSearchParamsSchema.parse({
            source: "not-a-corpus",
            unit: "words",
            amount: "50",
        });

        expect(parsed.source).toBeUndefined();
        expect(parsed.unit).toBe("words");
        expect(parsed.amount).toBe(50);
    });

    test("degrades an out-of-range number to undefined", () => {
        const parsed = loremSearchParamsSchema.parse({
            amount: "999999",
            paragraphs: String(MAX_LOREM_PARAGRAPHS + 1),
        });

        expect(parsed.amount).toBeUndefined();
        expect(parsed.paragraphs).toBeUndefined();
    });

    test("accepts either spelling of a switch, and ignores anything else", () => {
        expect(loremSearchParamsSchema.parse({ opener: "1" }).opener).toBe(true);
        expect(loremSearchParamsSchema.parse({ opener: "false" }).opener).toBe(false);
        expect(loremSearchParamsSchema.parse({ opener: "yes" }).opener).toBeUndefined();
    });

    test("returns every field undefined for an empty query", () => {
        expect(loremSearchParamsSchema.parse({})).toEqual({
            source: undefined,
            unit: undefined,
            amount: undefined,
            paragraphs: undefined,
            opener: undefined,
            format: undefined,
        });
    });
});
