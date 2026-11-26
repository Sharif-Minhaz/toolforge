import { describe, expect, test } from "bun:test";

import {
    DEFAULT_NUMBER_WORDS_OPTIONS,
    MAX_FRACTION_DIGITS,
    MAX_INTEGER_DIGITS,
    MAX_NUMBER_INPUT_LENGTH,
} from "@/modules/number-to-words/domain/constants";
import { convertNumberToWords } from "@/modules/number-to-words/domain/convert";
import type { NumberWordsOptions } from "@/modules/number-to-words/types";

function convert(input: string, options: Partial<NumberWordsOptions> = {}) {
    return convertNumberToWords(input, { ...DEFAULT_NUMBER_WORDS_OPTIONS, ...options });
}

describe("convertNumberToWords — cardinal", () => {
    test("reads a number out in English and Bangla at once", () => {
        expect(convert("1250500", { scale: "south-asian" })).toEqual({
            ok: true,
            english: "twelve lakh fifty thousand five hundred",
            bangla: "বারো লক্ষ পঞ্চাশ হাজার পাঁচ শত",
            numeral: "12,50,500",
            banglaNumeral: "১২,৫০,৫০০",
        });
    });

    test("counts English in millions by default, and groups the numeral to match", () => {
        expect(convert("1250500")).toMatchObject({
            english: "one million two hundred fifty thousand five hundred",
            numeral: "1,250,500",
            // Bangla counts in lakhs whatever the English line does.
            banglaNumeral: "১২,৫০,৫০০",
        });
    });

    test("reads decimals digit by digit after the point", () => {
        expect(convert("3.14")).toMatchObject({
            english: "three point one four",
            bangla: "তিন দশমিক এক চার",
            numeral: "3.14",
        });
    });

    test("reads a negative number, but never says minus zero", () => {
        expect(convert("-7")).toMatchObject({ english: "minus seven", bangla: "ঋণাত্মক সাত" });
        expect(convert("-0")).toMatchObject({ english: "zero", bangla: "শূন্য", numeral: "0" });
    });

    test("applies the letter case to the English line only", () => {
        expect(convert("125", { letterCase: "title" })).toMatchObject({
            english: "One Hundred Twenty-Five",
            bangla: "এক শত পঁচিশ",
        });
        expect(convert("125", { letterCase: "upper" })).toMatchObject({
            english: "ONE HUNDRED TWENTY-FIVE",
        });
        expect(convert("125", { letterCase: "sentence" })).toMatchObject({
            english: "One hundred twenty-five",
        });
    });

    test("refuses a fraction longer than anybody reads aloud", () => {
        expect(convert(`1.${"1".repeat(MAX_FRACTION_DIGITS + 1)}`)).toEqual({
            ok: false,
            reason: "too_many_decimals",
        });
    });

    test("refuses a whole part past the largest scale word", () => {
        expect(convert("9".repeat(MAX_INTEGER_DIGITS))).toMatchObject({ ok: true });
        expect(convert("9".repeat(MAX_INTEGER_DIGITS + 1))).toEqual({
            ok: false,
            reason: "too_many_digits",
        });
    });

    test("does not count leading zeros against the ceiling", () => {
        expect(convert(`000${"9".repeat(MAX_INTEGER_DIGITS)}`)).toMatchObject({ ok: true });
    });

    test("refuses an input longer than any number before parsing it", () => {
        expect(convert("1".repeat(MAX_NUMBER_INPUT_LENGTH + 1))).toEqual({
            ok: false,
            reason: "too_many_digits",
        });
    });

    test("passes a parse refusal through with its position", () => {
        expect(convert("12a")).toEqual({ ok: false, reason: "invalid_character", position: 3 });
    });
});

describe("convertNumberToWords — currency", () => {
    const CHEQUE = { format: "currency", scale: "south-asian" } as const;

    test("writes an amount the way a cheque does", () => {
        expect(convert("1250500.75", CHEQUE)).toEqual({
            ok: true,
            english: "twelve lakh fifty thousand five hundred taka and seventy-five paisa only",
            bangla: "বারো লক্ষ পঞ্চাশ হাজার পাঁচ শত টাকা পঁচাত্তর পয়সা মাত্র",
            numeral: "12,50,500.75",
            banglaNumeral: "১২,৫০,৫০০.৭৫",
        });
    });

    test("reads one decimal as tenths of the major unit, not as a count of the minor one", () => {
        expect(convert("10.5", CHEQUE)).toMatchObject({
            english: "ten taka and fifty paisa only",
            numeral: "10.50",
        });
    });

    test("writes a bare minor amount without a zero major unit", () => {
        expect(convert("0.05", CHEQUE)).toMatchObject({
            english: "five paisa only",
            bangla: "পাঁচ পয়সা মাত্র",
        });
    });

    test("writes zero as zero of the major unit", () => {
        expect(convert("0", CHEQUE)).toMatchObject({
            english: "zero taka only",
            bangla: "শূন্য টাকা মাত্র",
        });
    });

    test("uses the singular and plural unit names", () => {
        expect(convert("1.01", { ...CHEQUE, currency: "usd" })).toMatchObject({
            english: "one dollar and one cent only",
            bangla: "এক ডলার এক সেন্ট মাত্র",
        });
        expect(convert("2.50", { ...CHEQUE, currency: "gbp" })).toMatchObject({
            english: "two pounds and fifty pence only",
        });
        expect(convert("2", { ...CHEQUE, currency: "inr" })).toMatchObject({
            english: "two rupees only",
        });
    });

    test("drops only / মাত্র when asked", () => {
        expect(convert("5", { ...CHEQUE, appendOnly: false })).toMatchObject({
            english: "five taka",
            bangla: "পাঁচ টাকা",
        });
    });

    test("keeps 'and' small in title case", () => {
        expect(
            convert("105.50", { ...CHEQUE, letterCase: "title", britishAnd: true }),
        ).toMatchObject({
            english: "One Hundred and Five Taka and Fifty Paisa Only",
        });
    });

    test("refuses a third decimal rather than rounding it into a different sum", () => {
        expect(convert("10.555", CHEQUE)).toEqual({ ok: false, reason: "too_many_decimals" });
    });

    test("refuses a negative amount", () => {
        expect(convert("-5", CHEQUE)).toEqual({ ok: false, reason: "negative_amount" });
        expect(convert("-0", CHEQUE)).toMatchObject({ ok: true });
    });
});
