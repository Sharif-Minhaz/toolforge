import { describe, expect, test } from "bun:test";

import { bijoyToUnicode } from "@/modules/bijoy-unicode/domain/to-unicode";

/**
 * Bijoy strings as they appear in real SutonnyMJ documents, read back. Each
 * pair is either a published example (the national anthem; the README
 * examples of `@kovapdf/bijoy-unicode`) or a phrase common enough in
 * Bangladeshi government documents to be recognisable on sight.
 */
const REAL_TEXT: ReadonlyArray<readonly [string, string]> = [
    ["Avgvi †mvbvi evsjv", "আমার সোনার বাংলা"],
    ["Avwg †Zvgvq fv‡jvevwm|", "আমি তোমায় ভালোবাসি।"],
    ["evsjv‡`k miKvi", "বাংলাদেশ সরকার"],
    ["wkÿv", "শিক্ষা"],
    ["wk¶v", "শিক্ষা"],
    ["Kiæb", "করুন"],
    ["wbe©vPb Kwgkb", "নির্বাচন কমিশন"],
    ["miKvi KZ©„K", "সরকার কর্তৃক"],
    ["Kg©KZ©v", "কর্মকর্তা"],
    ["Kg©Pvix", "কর্মচারী"],
    ["mvwU©wd‡KU", "সার্টিফিকেট"],
    ["e¨envi", "ব্যবহার"],
    ["wbæwjwLZ", "নিম্নলিখিত"],
];

describe("bijoyToUnicode", () => {
    test.each(REAL_TEXT)("reads %p as %p", (bijoy, unicode) => {
        expect(bijoyToUnicode(bijoy)).toBe(unicode);
    });

    test("moves a vowel sign written before its cluster to after it", () => {
        // ‡ (ে) is drawn before প্র; Unicode wants it after.
        expect(bijoyToUnicode("‡cÖg")).toBe("প্রেম");
        expect(bijoyToUnicode("w¯Í")).toBe("স্তি");
    });

    test("joins ে on one side and া or ৗ on the other into ো and ৌ", () => {
        expect(bijoyToUnicode("†Zvgvq")).toBe("তোমায়");
        expect(bijoyToUnicode("†KŠZzK")).toBe("কৌতুক");
    });

    test("moves a reph typed after its consonant, or after the vowel sign, to before it", () => {
        expect(bijoyToUnicode("ag©")).toBe("ধর্ম");
        expect(bijoyToUnicode("ag©xq")).toBe("ধর্মীয়");
        // The other order some typists use: the sign first, then the reph.
        expect(bijoyToUnicode("agx©q")).toBe("ধর্মীয়");
        expect(bijoyToUnicode("ewY©Z")).toBe("বর্ণিত");
        expect(bijoyToUnicode("†KvU©")).toBe("কোর্ট");
    });

    test("writes ra with ya-phala with a joiner, so it is not read as a reph on য", () => {
        expect(bijoyToUnicode("i¨ve")).toBe("র‍্যাব");
    });

    test("reads ঁ typed before or after the vowel sign the same way", () => {
        expect(bijoyToUnicode("Pvu`")).toBe("চাঁদ");
        expect(bijoyToUnicode("Puv`")).toBe("চাঁদ");
    });

    test("turns every digit into a Bangla numeral", () => {
        expect(bijoyToUnicode("1971")).toBe("১৯৭১");
    });

    test("writes ড় ঢ় য় as letter + nukta, the NFC form", () => {
        const text = bijoyToUnicode("evwo");

        expect(text).toBe("বাড়ি");
        expect(text).toBe(text.normalize("NFC"));
        expect(text).not.toContain("ড়");
    });

    test("inserts a non-joiner after an explicit hasant before a consonant", () => {
        expect(bijoyToUnicode("K&K")).toBe("ক্‌ক");
        // At the end of a word there is nothing to keep apart.
        expect(bijoyToUnicode("K&")).toBe("ক্");
    });

    describe("codes that double as punctuation", () => {
        test("reads Ò Ó as curly quotes", () => {
            expect(bijoyToUnicode("Ò`vIÓ")).toBe("“দাও”");
        });

        test("reads ’ as ্থ after a half-form and as a quote elsewhere", () => {
            expect(bijoyToUnicode("e¨e¯’v")).toBe("ব্যবস্থা");
            expect(bijoyToUnicode("’")).toBe("’");
        });

        test("reads a degree sign after a digit as a degree sign", () => {
            expect(bijoyToUnicode("30°")).toBe("৩০°");
            expect(bijoyToUnicode("°")).toBe("°");
            expect(bijoyToUnicode("e°")).toBe("বক্ক");
        });

        test("reads × between numbers as multiplication, and as দ্ধ in a word", () => {
            expect(bijoyToUnicode("5 × 3")).toBe("৫ × ৩");
            expect(bijoyToUnicode("ï×")).toBe("শুদ্ধ");
        });

        test("reads © as a literal when no letter precedes it", () => {
            expect(bijoyToUnicode("© 2026")).toBe("© ২০২৬");
        });

        test("reads æ as ু under র and as ম্ন after any other letter", () => {
            expect(bijoyToUnicode("iæwP")).toBe("রুচি");
            expect(bijoyToUnicode("wbæ")).toBe("নিম্ন");
        });

        test("reads ø as ্ল after a letter and as স্ন on its own", () => {
            expect(bijoyToUnicode("cøveb")).toBe("প্লাবন");
            expect(bijoyToUnicode("øvb")).toBe("স্নান");
        });
    });

    describe("input mangled on its way here", () => {
        test("folds C1 control characters back to their Windows-1252 glyphs", () => {
            // ‡ is 0x87 in Windows-1252; a Latin-1 decoder hands it over as U+0087.
            expect(bijoyToUnicode("\u0087cÖg")).toBe("প্রেম");
        });

        test("folds the Symbol-font private-use page back to the byte it carries", () => {
            expect(bijoyToUnicode("")).toBe("আ");
        });
    });

    test("leaves Bangla Unicode already in the text untouched", () => {
        expect(bijoyToUnicode("Avwg আমি")).toBe("আমি আমি");
    });

    test("keeps emoji and line breaks exactly where they were", () => {
        expect(bijoyToUnicode("Avwg 😀\nZzwg")).toBe("আমি 😀\nতুমি");
    });

    test("returns an empty string for an empty input", () => {
        expect(bijoyToUnicode("")).toBe("");
    });
});
