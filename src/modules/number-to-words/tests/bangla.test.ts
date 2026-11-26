import { describe, expect, test } from "bun:test";

import {
    BANGLA_BELOW_HUNDRED,
    banglaDigits,
    banglaInteger,
} from "@/modules/number-to-words/domain/bangla";

describe("the Bangla table", () => {
    test("has a word for every number below a hundred", () => {
        expect(BANGLA_BELOW_HUNDRED).toHaveLength(100);
        expect(new Set(BANGLA_BELOW_HUNDRED).size).toBe(100);
    });

    test("is written in NFC, so the words match other Unicode text", () => {
        for (const word of BANGLA_BELOW_HUNDRED) {
            expect(word).toBe(word.normalize("NFC"));
        }
    });

    // A sample of the entries an independent implementation (`to-words`, bn-BD)
    // was compared against; all hundred agreed. These are the irregular ones a
    // pattern would get wrong.
    test.each([
        [21, "একুশ"],
        [29, "উনত্রিশ"],
        [37, "সাঁইত্রিশ"],
        [42, "বিয়াল্লিশ"],
        [52, "বায়ান্ন"],
        [66, "ছেষট্টি"],
        [73, "তিয়াত্তর"],
        [89, "উননব্বই"],
        [99, "নিরানব্বই"],
    ])("%p is %p", (value, word) => {
        expect(BANGLA_BELOW_HUNDRED[value]).toBe(word);
    });
});

describe("banglaInteger", () => {
    test.each([
        ["0", "শূন্য"],
        ["100", "এক শত"],
        ["250", "দুই শত পঞ্চাশ"],
        ["1000", "এক হাজার"],
        ["1005", "এক হাজার পাঁচ"],
        ["100000", "এক লক্ষ"],
        ["1250500", "বারো লক্ষ পঞ্চাশ হাজার পাঁচ শত"],
        ["10000000", "এক কোটি"],
        ["123456789", "বারো কোটি চৌত্রিশ লক্ষ ছাপ্পান্ন হাজার সাত শত উননব্বই"],
        ["1000000000", "এক আরব"],
        ["100000000000", "এক খরব"],
        ["10000000000000", "এক নীল"],
        ["1000000000000000", "এক পদ্ম"],
        ["100000000000000000", "এক শঙ্খ"],
        [
            "1234567891234567890",
            "বারো শঙ্খ চৌত্রিশ পদ্ম ছাপ্পান্ন নীল আটাত্তর খরব একানব্বই আরব তেইশ কোটি পঁয়তাল্লিশ লক্ষ সাতষট্টি হাজার আট শত নব্বই",
        ],
        // Past শঙ্খ, the count of শঙ্খ is itself a number.
        ["10000000000000000000", "এক শত শঙ্খ"],
    ])("%p is %p", (digits, words) => {
        expect(banglaInteger(digits)).toBe(words);
    });
});

describe("banglaDigits", () => {
    test("reads digits one at a time", () => {
        expect(banglaDigits("1405")).toBe("এক চার শূন্য পাঁচ");
    });
});
