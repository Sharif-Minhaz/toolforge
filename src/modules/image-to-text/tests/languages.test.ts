import { describe, expect, test } from "bun:test";

import { ENGINE_BYTES, LANGUAGE_DATA_BYTES } from "../domain/constants";
import {
    defaultLanguageForLocale,
    firstRunBytes,
    isOcrLanguage,
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
    test("every language has an endonym, a tag and a data size", () => {
        for (const language of OCR_LANGUAGES) {
            expect(LANGUAGE_ENDONYMS[language].length).toBeGreaterThan(0);
            expect(Intl.getCanonicalLocales(LANGUAGE_TAGS[language])).toHaveLength(1);
            expect(LANGUAGE_DATA_BYTES[language]).toBeGreaterThan(1_000_000);
        }
    });

    test("only Arabic is right to left", () => {
        expect(OCR_LANGUAGES.filter(isRightToLeft)).toEqual(["ara"]);
    });

    test("a first run downloads the engine and every language it loads", () => {
        expect(firstRunBytes("eng")).toBe(ENGINE_BYTES + LANGUAGE_DATA_BYTES.eng);
        expect(firstRunBytes("ben")).toBe(
            ENGINE_BYTES + LANGUAGE_DATA_BYTES.ben + LANGUAGE_DATA_BYTES.eng,
        );
    });

    test("recognises its own codes and nothing else", () => {
        expect(isOcrLanguage("chi_sim")).toBe(true);
        expect(isOcrLanguage("fra")).toBe(false);
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
