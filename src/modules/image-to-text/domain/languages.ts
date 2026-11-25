import { OCR_LANGUAGES, type OcrLanguage } from "../types";
import { ENGINE_BYTES, LANGUAGE_DATA_BYTES } from "./constants";

/**
 * Each language in its own script — data, not copy, so it reads the same in
 * either locale and a reader finds their language whatever the page is in.
 */
export const LANGUAGE_ENDONYMS: Record<OcrLanguage, string> = {
    eng: "English",
    spa: "Español",
    hin: "हिन्दी",
    ben: "বাংলা",
    ara: "العربية",
    chi_sim: "简体中文",
    chi_tra: "繁體中文",
    jpn: "日本語",
};

/**
 * BCP 47 tags for the box's `lang`, which picks the right font and shaping for
 * Han — the same character is drawn differently in Simplified, Traditional
 * and Japanese — and tells a screen reader which voice to use.
 */
export const LANGUAGE_TAGS: Record<OcrLanguage, string> = {
    eng: "en",
    spa: "es",
    hin: "hi",
    ben: "bn",
    ara: "ar",
    chi_sim: "zh-Hans",
    chi_tra: "zh-Hant",
    jpn: "ja",
};

const RIGHT_TO_LEFT: ReadonlySet<OcrLanguage> = new Set(["ara"]);

export function isOcrLanguage(value: string): value is OcrLanguage {
    return (OCR_LANGUAGES as readonly string[]).includes(value);
}

/**
 * What Tesseract is asked to load. English rides along with every other
 * language, because a Bangla receipt still has `VAT` on it — but it goes
 * second: as the primary language it reads other scripts as Latin.
 */
export function tesseractLanguages(language: OcrLanguage): readonly string[] {
    return language === "eng" ? ["eng"] : [language, "eng"];
}

export function isRightToLeft(language: OcrLanguage): boolean {
    return RIGHT_TO_LEFT.has(language);
}

/** Everything a first run downloads; later runs read it from the browser's cache. */
export function firstRunBytes(language: OcrLanguage): number {
    return (
        ENGINE_BYTES +
        tesseractLanguages(language).reduce(
            (total, code) => total + (isOcrLanguage(code) ? LANGUAGE_DATA_BYTES[code] : 0),
            0,
        )
    );
}

/** The page opens on the language its reader is most likely holding a picture of. */
export function defaultLanguageForLocale(locale: string): OcrLanguage {
    return locale === "bn" ? "ben" : "eng";
}
