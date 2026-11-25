import { OCR_LANGUAGES, type OcrLanguage } from "../types";
import { tesseractLanguages } from "./languages";

/**
 * Which language files this browser has already fetched for the engine.
 *
 * Tesseract keeps each language's data in IndexedDB after the first read, but
 * the page cannot ask it what is there without starting a worker — seconds of
 * work, and offline it would only fail. So the fact is written down here once a
 * worker has started with a language, and the workbench reads it back to tell
 * an offline reader which languages still work.
 *
 * The same shape as `tools/domain/cutout-memory.ts`, and fail-safe the same
 * way: storage empty, blocked or edited by hand reads as "nothing fetched", and
 * a remembered language the browser has since evicted costs one failed run.
 */

export const OCR_LANGUAGE_MEMORY_KEY = "toolforge.ocr.languages";

export type LanguageMemoryStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};

function browserStorage(): LanguageMemoryStorage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        // Reading `localStorage` throws outright when storage is blocked by
        // policy, which is a supported way to browse rather than an error.
        return undefined;
    }
}

function isLanguage(value: unknown): value is OcrLanguage {
    return typeof value === "string" && (OCR_LANGUAGES as readonly string[]).includes(value);
}

/** Every language recorded as fetched, in no particular order. */
export function readFetchedLanguages(
    storage: LanguageMemoryStorage | undefined = browserStorage(),
): readonly OcrLanguage[] {
    if (!storage) {
        return [];
    }

    try {
        const raw = storage.getItem(OCR_LANGUAGE_MEMORY_KEY);
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);

        return Array.isArray(parsed) ? [...new Set(parsed.filter(isLanguage))] : [];
    } catch {
        return [];
    }
}

/**
 * Records that a language's data arrived and a worker started on it.
 *
 * Every file the worker loaded is recorded — English rides along with every
 * other language, so reading Bangla once also makes English available offline.
 * Written after the start rather than before the fetch, so a download that was
 * abandoned halfway is not remembered as a file the browser has.
 */
export function rememberFetchedLanguage(
    language: OcrLanguage,
    storage: LanguageMemoryStorage | undefined = browserStorage(),
): void {
    if (!storage) {
        return;
    }

    const fetched = readFetchedLanguages(storage);
    const added = tesseractLanguages(language).filter(
        (code): code is OcrLanguage => isLanguage(code) && !fetched.includes(code),
    );

    if (added.length === 0) {
        return;
    }

    try {
        storage.setItem(OCR_LANGUAGE_MEMORY_KEY, JSON.stringify([...fetched, ...added]));
    } catch {
        // Quota, private mode, policy: a memory of convenience is never worth
        // failing the read that just started.
    }
}
