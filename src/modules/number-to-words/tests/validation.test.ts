import { describe, expect, test } from "bun:test";

import { DEFAULT_NUMBER_WORDS_OPTIONS } from "@/modules/number-to-words/domain/constants";
import {
    numberWordsOptionsSchema,
    numberWordsSearchParamsSchema,
} from "@/modules/number-to-words/validation/number-options";

describe("numberWordsOptionsSchema", () => {
    test("accepts the defaults the page starts from", () => {
        expect(numberWordsOptionsSchema.safeParse(DEFAULT_NUMBER_WORDS_OPTIONS).success).toBe(true);
    });

    test("refuses a currency the tool does not have", () => {
        expect(
            numberWordsOptionsSchema.safeParse({ ...DEFAULT_NUMBER_WORDS_OPTIONS, currency: "jpy" })
                .success,
        ).toBe(false);
    });
});

describe("numberWordsSearchParamsSchema", () => {
    test("reads a shared link", () => {
        expect(
            numberWordsSearchParamsSchema.parse({
                n: "1250.50",
                format: "currency",
                currency: "usd",
                scale: "international",
            }),
        ).toEqual({
            n: "1250.50",
            format: "currency",
            currency: "usd",
            scale: "international",
        });
    });

    test("drops each malformed field on its own", () => {
        expect(
            numberWordsSearchParamsSchema.parse({
                n: "42",
                format: "roman",
                currency: ["bdt", "usd"],
            }),
        ).toEqual({
            n: "42",
            format: undefined,
            currency: undefined,
            scale: undefined,
        });
    });
});
