import { describe, expect, test } from "bun:test";

import { toBanglaDate } from "../domain/bangla-calendar";
import { banglaMonthName, formatBanglaDate } from "../domain/bangla-names";

describe("formatBanglaDate", () => {
    test("writes a বঙ্গাব্দ date in Bangla script, digits and all", () => {
        expect(formatBanglaDate(toBanglaDate({ year: 2001, month: 11, day: 13 }))).toBe(
            "২৯ কার্তিক ১৪০৮ বঙ্গাব্দ",
        );
        expect(formatBanglaDate(toBanglaDate({ year: 2026, month: 11, day: 27 }))).toBe(
            "১২ অগ্রহায়ণ ১৪৩৩ বঙ্গাব্দ",
        );
    });

    test("names all twelve months, বৈশাখ first", () => {
        expect(Array.from({ length: 12 }, (_, index) => banglaMonthName(index + 1))).toEqual([
            "বৈশাখ",
            "জ্যৈষ্ঠ",
            "আষাঢ়",
            "শ্রাবণ",
            "ভাদ্র",
            "আশ্বিন",
            "কার্তিক",
            "অগ্রহায়ণ",
            "পৌষ",
            "মাঘ",
            "ফাল্গুন",
            "চৈত্র",
        ]);
    });
});
