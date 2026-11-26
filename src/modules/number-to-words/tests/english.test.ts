import { describe, expect, test } from "bun:test";

import { englishDigits, englishInteger } from "@/modules/number-to-words/domain/english";

const US = { scale: "international", britishAnd: false } as const;
const UK = { scale: "international", britishAnd: true } as const;
const SA = { scale: "south-asian", britishAnd: false } as const;

describe("englishInteger", () => {
    test.each([
        ["0", "zero"],
        ["7", "seven"],
        ["13", "thirteen"],
        ["20", "twenty"],
        ["21", "twenty-one"],
        ["99", "ninety-nine"],
        ["100", "one hundred"],
        ["101", "one hundred one"],
        ["110", "one hundred ten"],
        ["999", "nine hundred ninety-nine"],
        ["1000", "one thousand"],
        ["1001", "one thousand one"],
        ["1250500", "one million two hundred fifty thousand five hundred"],
        ["1000000000", "one billion"],
        ["1000000000000", "one trillion"],
    ])("international: %p is %p", (digits, words) => {
        expect(englishInteger(digits, US)).toBe(words);
    });

    test.each([
        ["105", "one hundred and five"],
        ["1005", "one thousand and five"],
        ["1105", "one thousand one hundred and five"],
        ["1000001", "one million and one"],
        ["1000100", "one million one hundred"],
    ])("British: %p is %p", (digits, words) => {
        expect(englishInteger(digits, UK)).toBe(words);
    });

    test.each([
        ["1000", "one thousand"],
        ["99999", "ninety-nine thousand nine hundred ninety-nine"],
        ["100000", "one lakh"],
        ["1250500", "twelve lakh fifty thousand five hundred"],
        ["10000000", "one crore"],
        ["123456789", "twelve crore thirty-four lakh fifty-six thousand seven hundred eighty-nine"],
        ["1000000000", "one arab"],
        ["100000000000", "one kharab"],
        ["10000000000000", "one neel"],
        ["1000000000000000", "one padma"],
        ["100000000000000000", "one shankh"],
        [
            "1234567891234567890",
            "twelve shankh thirty-four padma fifty-six neel seventy-eight kharab ninety-one arab twenty-three crore forty-five lakh sixty-seven thousand eight hundred ninety",
        ],
        // Past a shankh, the count of shankhs is itself a number.
        ["10000000000000000000", "one hundred shankh"],
        ["1".padEnd(25, "0"), "one crore shankh"],
    ])("lakhs and crores: %p is %p", (digits, words) => {
        expect(englishInteger(digits, SA)).toBe(words);
    });

    test("puts the British and before a remainder under a hundred after a crore", () => {
        expect(englishInteger("10000001", { scale: "south-asian", britishAnd: true })).toBe(
            "one crore and one",
        );
    });

    test.each([
        ["1".padEnd(28, "0"), "one octillion"],
        ["1".padEnd(25, "0"), "one septillion"],
        ["1".padEnd(34, "0"), "one decillion"],
        ["1".padEnd(37, "0"), "one undecillion"],
        ["1".padEnd(64, "0"), "one vigintillion"],
        ["1".padEnd(94, "0"), "one trigintillion"],
        ["1".padEnd(100, "0"), "one duotrigintillion"],
    ])("international: %p is %p", (digits, words) => {
        expect(englishInteger(digits, US)).toBe(words);
    });

    test("reads exactly a googol by its name, and its neighbours by the scale", () => {
        expect(englishInteger("1".padEnd(101, "0"), US)).toBe("one googol");
        expect(englishInteger(`1${"0".repeat(99)}1`, US)).toBe("ten duotrigintillion one");
        expect(englishInteger("2".padEnd(101, "0"), US)).toBe("twenty duotrigintillion");
    });

    test("reads the thirty-digit number from a reference calculator the same way", () => {
        expect(englishInteger("234242423423423424324234234342", US)).toBe(
            "two hundred thirty-four octillion two hundred forty-two septillion four hundred twenty-three sextillion four hundred twenty-three quintillion four hundred twenty-three quadrillion four hundred twenty-four trillion three hundred twenty-four billion two hundred thirty-four million two hundred thirty-four thousand three hundred forty-two",
        );
    });

    test("names the largest number the tool accepts", () => {
        expect(
            englishInteger("9".repeat(102), US).startsWith(
                "nine hundred ninety-nine duotrigintillion",
            ),
        ).toBe(true);
    });
});

describe("englishDigits", () => {
    test("reads digits one at a time", () => {
        expect(englishDigits("1405")).toBe("one four zero five");
    });
});
