import { describe, expect, test } from "bun:test";

import {
    defaultLanguageForLocale,
    isRightToLeft,
    LANGUAGE_ENDONYMS,
    LANGUAGE_TAGS,
    tesseractLanguages,
} from "../domain/languages";
import { OCR_LANGUAGES } from "../types";
import { ocrSearchParamsSchema } from "../validation/ocr-options";

describe("tesseractLanguages", () => {
    test("English alone is just English", () => {
        expect(tesseractLanguages("eng")).toEqual(["eng"]);
    });

    test("every other language reads English too, second", () => {
        for (const language of OCR_LANGUAGES.filter((code) => code !== "eng")) {
            expect(tesseractLanguages(language)).toEqual([language, "eng"]);
        }
    });
});

describe("language data", () => {
    test("every language has an endonym and a tag", () => {
        for (const language of OCR_LANGUAGES) {
            expect(LANGUAGE_ENDONYMS[language].length).toBeGreaterThan(0);
            expect(Intl.getCanonicalLocales(LANGUAGE_TAGS[language])).toHaveLength(1);
        }
    });

    test("only Arabic is right to left", () => {
        expect(OCR_LANGUAGES.filter(isRightToLeft)).toEqual(["ara"]);
    });

    test("the Bangla page opens on Bangla", () => {
        expect(defaultLanguageForLocale("bn")).toBe("ben");
        expect(defaultLanguageForLocale("en")).toBe("eng");
    });
});

describe("ocrSearchParamsSchema", () => {
    test("reads a known language", () => {
        expect(ocrSearchParamsSchema.parse({ lang: "jpn" })).toEqual({ lang: "jpn" });
    });

    test("an unknown or repeated language degrades to the default", () => {
        expect(ocrSearchParamsSchema.parse({ lang: "klingon" })).toEqual({ lang: undefined });
        expect(ocrSearchParamsSchema.parse({ lang: ["eng", "ben"] })).toEqual({ lang: undefined });
        expect(ocrSearchParamsSchema.parse({})).toEqual({ lang: undefined });
    });
});
