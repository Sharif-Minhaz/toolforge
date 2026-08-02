import { describe, expect, test } from "bun:test";

import { DEFAULT_SLUG_OPTIONS, MAX_SLUG_LENGTH } from "@/modules/slug/domain/constants";
import { isValidMaxLength } from "@/modules/slug/domain/slugify";
import { slugOptionsSchema, slugSearchParamsSchema } from "@/modules/slug/validation/slug-options";

describe("slug options schema", () => {
    test("accepts the shipped defaults, so the tool cannot open outside its own bounds", () => {
        expect(slugOptionsSchema.safeParse(DEFAULT_SLUG_OPTIONS).success).toBe(true);
    });

    test("rejects a ceiling above the maximum or below zero", () => {
        for (const maxLength of [-1, MAX_SLUG_LENGTH + 1, 12.5]) {
            expect(
                slugOptionsSchema.safeParse({ ...DEFAULT_SLUG_OPTIONS, maxLength }).success,
            ).toBe(false);
            expect(isValidMaxLength(maxLength)).toBe(false);
        }

        expect(isValidMaxLength(0)).toBe(true);
        expect(isValidMaxLength(MAX_SLUG_LENGTH)).toBe(true);
    });

    test("rejects a separator the picker never offers", () => {
        expect(
            slugOptionsSchema.safeParse({ ...DEFAULT_SLUG_OPTIONS, separator: "pipe" }).success,
        ).toBe(false);
    });
});

describe("slug search params", () => {
    test("reads a shared link", () => {
        const parsed = slugSearchParamsSchema.parse({
            text: "How to Build a Website",
            separator: "custom",
            custom: "~",
        });

        expect(parsed).toEqual({
            text: "How to Build a Website",
            separator: "custom",
            custom: "~",
        });
    });

    test("degrades one malformed field to a default instead of throwing the page away", () => {
        const parsed = slugSearchParamsSchema.parse({
            text: "still here",
            separator: "pipe",
            custom: "way too long to be a separator",
        });

        expect(parsed.text).toBe("still here");
        expect(parsed.separator).toBeUndefined();
        expect(parsed.custom).toBeUndefined();
    });

    test("survives a request with no parameters at all", () => {
        expect(slugSearchParamsSchema.parse({})).toEqual({
            text: undefined,
            separator: undefined,
            custom: undefined,
        });
    });
});
