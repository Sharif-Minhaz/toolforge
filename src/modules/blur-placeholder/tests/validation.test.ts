import { describe, expect, test } from "bun:test";

import { placeholderSearchParamsSchema } from "@/modules/blur-placeholder/validation/placeholder-options";

describe("placeholderSearchParamsSchema", () => {
    test("reads a fully specified link", () => {
        const parsed = placeholderSearchParamsSchema.parse({
            mode: "decode",
            x: "6",
            y: "4",
            punch: "1.5",
            edge: "48",
            ratio: "16:9",
            hash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        });

        expect(parsed).toEqual({
            mode: "decode",
            x: 6,
            y: 4,
            punch: 1.5,
            edge: 48,
            ratio: "16:9",
            hash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        });
    });

    test("drops one bad field without losing the rest", () => {
        const parsed = placeholderSearchParamsSchema.parse({
            mode: "sideways",
            x: "4",
            y: "300",
            punch: "1.37",
            edge: "33",
            ratio: "21:9",
        });

        expect(parsed).toEqual({
            mode: undefined,
            x: 4,
            y: undefined,
            punch: undefined,
            edge: undefined,
            ratio: undefined,
            hash: undefined,
        });
    });

    test("accepts an empty query", () => {
        expect(placeholderSearchParamsSchema.parse({})).toEqual({
            mode: undefined,
            x: undefined,
            y: undefined,
            punch: undefined,
            edge: undefined,
            ratio: undefined,
            hash: undefined,
        });
    });

    test("keeps a hash out of the page when it could not be one", () => {
        const parsed = placeholderSearchParamsSchema.parse({ hash: "x".repeat(300) });

        expect(parsed.hash).toBeUndefined();
    });

    test("trims a hash that arrived with whitespace around it", () => {
        const parsed = placeholderSearchParamsSchema.parse({ hash: "  LEHV6nWB  " });

        expect(parsed.hash).toBe("LEHV6nWB");
    });

    test("takes only half-steps of punch, matching the slider", () => {
        expect(placeholderSearchParamsSchema.parse({ punch: "2.5" }).punch).toBe(2.5);
        expect(placeholderSearchParamsSchema.parse({ punch: "2.25" }).punch).toBeUndefined();
        expect(placeholderSearchParamsSchema.parse({ punch: "0" }).punch).toBeUndefined();
        expect(placeholderSearchParamsSchema.parse({ punch: "9" }).punch).toBeUndefined();
    });
});
