import { describe, expect, test } from "bun:test";

import { unicodeToBijoy } from "@/modules/bijoy-unicode/domain/to-bijoy";
import { bijoyToUnicode } from "@/modules/bijoy-unicode/domain/to-unicode";

/**
 * Words chosen to reach every branch of the cluster builder: plain letters,
 * each pre-base sign, ো and ৌ, reph before and after a sign, ya- and
 * ra-phala, every half-form, the fused ু glyphs, three-consonant ligatures,
 * khanda ta, the nukta letters, ya-phala on a vowel letter, and ra + ya-phala.
 */
const CORPUS = [
    "আমার সোনার বাংলা, আমি তোমায় ভালোবাসি।",
    "কর্মকর্তা",
    "কর্মী",
    "ধর্মীয়",
    "বর্ণিত",
    "প্রেম",
    "ক্রম",
    "দ্রুত",
    "শ্রমিক",
    "গ্রাম",
    "খাদ্য",
    "করুন",
    "রূপ",
    "গুরুত্ব",
    "শুরু",
    "হৃদয়",
    "কৌতুক",
    "চাঁদ",
    "শিক্ষা",
    "লক্ষ্মী",
    "স্বাধীনতা",
    "উজ্জ্বল",
    "র‍্যাব",
    "কার্য",
    "সূর্য",
    "অ্যাপ",
    "ব্যবস্থা",
    "আত্মা",
    "সন্ধ্যা",
    "কেন্দ্র",
    "বৈশাখ",
    "বৎসর",
    "মঙ্গল",
    "বিজ্ঞান",
    "স্কুল",
    "স্ত্রী",
    "দুঃখ",
    "নিম্নলিখিত",
    "নির্বাচন",
    "কর্তৃক",
    "বস্তু",
    "কিন্তু",
    "পৌঁছানো",
    "সম্পর্ক",
    "নির্দেশ",
    "পূর্বে",
    "ব্রাহ্মণ",
    "আর্দ্র",
    "চিহ্ন",
    "বাড়ি",
    "বিদ্যুৎ",
    "উদ্ভিদ",
    "ক্ষেত্রে",
    "স্মৃতি",
    "রাষ্ট্র",
    "উৎপাদন",
    "১৯৭১ সালের ২৬ মার্চ",
];

describe("unicodeToBijoy", () => {
    test.each(CORPUS)("%p survives the round trip through Bijoy", (word) => {
        expect(bijoyToUnicode(unicodeToBijoy(word))).toBe(word.normalize("NFC"));
    });

    test("writes the national anthem the way every Bijoy typist does", () => {
        expect(unicodeToBijoy("আমার সোনার বাংলা")).toBe("Avgvi †mvbvi evsjv");
    });

    test("uses † for ে at the start of a word and ‡ inside one", () => {
        expect(unicodeToBijoy("সোনা")).toBe("†mvbv");
        expect(unicodeToBijoy("বাংলাদেশ")).toBe("evsjv‡`k");
    });

    test("puts the reph straight after its cluster, before the vowel sign", () => {
        expect(unicodeToBijoy("নির্বাচন")).toBe("wbe©vPb");
        expect(unicodeToBijoy("কর্মকর্তা")).toBe("Kg©KZ©v");
    });

    test("draws the fused ু glyphs for গু শু হু and হৃ", () => {
        expect(unicodeToBijoy("গুরু")).toBe("¸iæ");
        expect(unicodeToBijoy("শুধু")).toBe("ïay");
        expect(unicodeToBijoy("হুকুম")).toBe("ûKzg");
        expect(unicodeToBijoy("হৃদয়")).toBe("ü`q");
    });

    test("picks the ra-phala the predecessor needs", () => {
        expect(unicodeToBijoy("প্র")).toBe("cÖ");
        expect(unicodeToBijoy("গ্র")).toBe("MÖ");
        expect(unicodeToBijoy("ফ্র")).toBe("d«");
        expect(unicodeToBijoy("শ্র")).toBe("kª");
    });

    test("reads the precomposed nukta letters and the decomposed ones alike", () => {
        expect(unicodeToBijoy("ড়")).toBe("o");
        expect(unicodeToBijoy("ড়")).toBe("o");
    });

    test("reads the old ত + hasant + joiner spelling of ৎ", () => {
        expect(unicodeToBijoy("ত্‍")).toBe("r");
    });

    test("rewrites curly quotes and dashes to the codes SutonnyMJ draws as punctuation", () => {
        expect(unicodeToBijoy("“হ্যাঁ” — না")).toBe("Òn¨vuÓ Ñ bv");
    });

    test("falls back to an explicit hasant for a pair the font has no shape for", () => {
        expect(unicodeToBijoy("ক্খ")).toBe("K&L");
    });

    test("leaves text that is not Bangla exactly as it was", () => {
        expect(unicodeToBijoy("Hello, 2026!")).toBe("Hello, 2026!");
    });

    test("drops joiners inside Bangla and keeps them elsewhere", () => {
        expect(unicodeToBijoy("ক‌ক")).toBe("KK");
        expect(unicodeToBijoy("a‍b")).toBe("a‍b");
    });
});
