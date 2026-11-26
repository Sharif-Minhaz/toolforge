import { describe, expect, test } from "bun:test";

import { BIJOY_SAMPLE, MAX_BIJOY_INPUT_LENGTH } from "@/modules/bijoy-unicode/domain/constants";
import { convertBijoy } from "@/modules/bijoy-unicode/domain/convert";

describe("convertBijoy", () => {
    test("converts the sample both ways", () => {
        const toUnicode = convertBijoy(BIJOY_SAMPLE.bijoy, "to-unicode");
        const toBijoy = convertBijoy(BIJOY_SAMPLE.unicode, "to-bijoy");

        expect(toUnicode).toMatchObject({ ok: true, text: BIJOY_SAMPLE.unicode, notice: null });
        expect(toBijoy).toMatchObject({ ok: true, text: BIJOY_SAMPLE.bijoy, notice: null });
    });

    test("counts the converted text, not the input", () => {
        const result = convertBijoy("Avwg", "to-unicode");

        expect(result.ok && result.stats).toEqual({ characters: 3, words: 1, lines: 1 });
    });

    test("notices text that is already Unicode, and converts it anyway", () => {
        const result = convertBijoy("আমি", "to-unicode");

        expect(result).toMatchObject({ ok: true, text: "আমি", notice: "already_unicode" });
    });

    test("notices text with nothing Bangla in it on the way to Bijoy", () => {
        expect(convertBijoy("hello", "to-bijoy")).toMatchObject({ ok: true, notice: "no_bangla" });
    });

    test("says nothing about an empty box", () => {
        expect(convertBijoy("  ", "to-bijoy")).toMatchObject({ ok: true, notice: null });
    });

    test("refuses past the ceiling rather than freezing the tab", () => {
        expect(convertBijoy("a".repeat(MAX_BIJOY_INPUT_LENGTH + 1), "to-unicode")).toEqual({
            ok: false,
            reason: "too_long",
        });
    });
});
