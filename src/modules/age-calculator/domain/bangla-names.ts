import { toBanglaDigits } from "@/modules/tools/domain/bangla-digits";
import { BANGLA_MONTHS, type BanglaMonth } from "../types";

/**
 * A বঙ্গাব্দ date is written in Bangla on every page, the English one included:
 * "২৯ কার্তিক ১৪০৮ বঙ্গাব্দ" is the form a certificate, a deed and a newspaper
 * masthead use, and a transliteration like "29 Kartik 1408 BS" is a spelling
 * nobody agrees on. So the names are data, the same in either locale, rather
 * than copy translated per locale — the way the land tool's unit names are.
 *
 * Spellings are Bangla Academy's.
 */
export const BANGLA_MONTH_NAMES: Readonly<Record<BanglaMonth, string>> = {
    boishakh: "বৈশাখ",
    jyoishtho: "জ্যৈষ্ঠ",
    asharh: "আষাঢ়",
    srabon: "শ্রাবণ",
    bhadro: "ভাদ্র",
    ashwin: "আশ্বিন",
    kartik: "কার্তিক",
    agrahayan: "অগ্রহায়ণ",
    poush: "পৌষ",
    magh: "মাঘ",
    falgun: "ফাল্গুন",
    chaitra: "চৈত্র",
};

export const BANGLA_ERA = "বঙ্গাব্দ";

/** 1 = বৈশাখ through 12 = চৈত্র. */
export function banglaMonthName(month: number): string {
    return BANGLA_MONTH_NAMES[BANGLA_MONTHS[month - 1]];
}

/** `২৯ কার্তিক ১৪০৮ বঙ্গাব্দ`. */
export function formatBanglaDate(date: {
    readonly year: number;
    readonly month: number;
    readonly day: number;
}): string {
    return `${toBanglaDigits(String(date.day))} ${banglaMonthName(date.month)} ${toBanglaDigits(String(date.year))} ${BANGLA_ERA}`;
}
