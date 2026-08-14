import { describe, expect, test } from "bun:test";

import {
    DEFAULT_TEXT_CASE_OPTIONS,
    MAX_SHARED_TEXT_LENGTH,
    supportsAcronyms,
} from "@/modules/text-case/domain/constants";
import {
    textCaseOptionsSchema,
    textCaseSearchParamsSchema,
} from "@/modules/text-case/validation/text-case-options";
import { IDENTIFIER_CASES, PROSE_CASES, TEXT_CASES } from "@/modules/text-case/types";

describe("textCaseOptionsSchema", () => {
    test("accepts the defaults the page starts from", () => {
        expect(textCaseOptionsSchema.safeParse(DEFAULT_TEXT_CASE_OPTIONS).success).toBe(true);
    });

    test("refuses a case the tool does not have", () => {
        expect(
            textCaseOptionsSchema.safeParse({ ...DEFAULT_TEXT_CASE_OPTIONS, textCase: "shouty" })
                .success,
        ).toBe(false);
    });
});

describe("textCaseSearchParamsSchema", () => {
    test("reads a shared link", () => {
        expect(textCaseSearchParamsSchema.parse({ text: "hello world", case: "upper" })).toEqual({
            text: "hello world",
            case: "upper",
        });
    });

    test("degrades one bad field to a default instead of throwing the page away", () => {
        const parsed = textCaseSearchParamsSchema.parse({ text: "keep me", case: "shouty" });

        expect(parsed.text).toBe("keep me");
        expect(parsed.case).toBeUndefined();
    });

    test("drops shared text past the link ceiling rather than truncating it", () => {
        const parsed = textCaseSearchParamsSchema.parse({
            text: "a".repeat(MAX_SHARED_TEXT_LENGTH + 1),
        });

        expect(parsed.text).toBeUndefined();
    });
});

describe("the case list", () => {
    test("holds both families and nothing else", () => {
        expect(TEXT_CASES).toEqual([...PROSE_CASES, ...IDENTIFIER_CASES]);
        expect(new Set(TEXT_CASES).size).toBe(TEXT_CASES.length);
    });

    test("names the five cases that read the acronym switch", () => {
        // Pinned rather than derived: this is the list the options panel greys
        // its switch against, and a case joining or leaving it silently would
        // leave a control enabled that does nothing.
        expect(TEXT_CASES.filter(supportsAcronyms)).toEqual([
            "sentence",
            "capitalized",
            "title",
            "camel",
            "pascal",
        ]);
    });
});
