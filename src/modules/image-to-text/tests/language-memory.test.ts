import { describe, expect, test } from "bun:test";

import {
    OCR_LANGUAGE_MEMORY_KEY,
    readFetchedLanguages,
    rememberFetchedLanguage,
    type LanguageMemoryStorage,
} from "../domain/language-memory";

function fakeStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    const storage: LanguageMemoryStorage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => {
            store.set(key, value);
        },
    };

    return { storage, store };
}

describe("readFetchedLanguages", () => {
    test("is empty with no storage, no key, or nonsense in it", () => {
        expect(readFetchedLanguages(undefined)).toEqual([]);
        expect(readFetchedLanguages(fakeStorage().storage)).toEqual([]);
        expect(
            readFetchedLanguages(fakeStorage({ [OCR_LANGUAGE_MEMORY_KEY]: "{" }).storage),
        ).toEqual([]);
        expect(
            readFetchedLanguages(fakeStorage({ [OCR_LANGUAGE_MEMORY_KEY]: '{"a":1}' }).storage),
        ).toEqual([]);
    });

    test("keeps only languages this version knows, once each", () => {
        const { storage } = fakeStorage({
            [OCR_LANGUAGE_MEMORY_KEY]: '["ben","klingon","ben","jpn",3]',
        });

        expect(readFetchedLanguages(storage)).toEqual(["ben", "jpn"]);
    });

    test("survives a storage that throws on read", () => {
        const storage: LanguageMemoryStorage = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {},
        };

        expect(readFetchedLanguages(storage)).toEqual([]);
    });
});

describe("rememberFetchedLanguage", () => {
    test("records English alongside every other language, without repeats", () => {
        const { storage, store } = fakeStorage();

        rememberFetchedLanguage("ben", storage);
        rememberFetchedLanguage("eng", storage);
        rememberFetchedLanguage("jpn", storage);

        expect(JSON.parse(store.get(OCR_LANGUAGE_MEMORY_KEY) ?? "[]")).toEqual([
            "ben",
            "eng",
            "jpn",
        ]);
    });

    test("swallows a full or blocked store rather than failing the read", () => {
        const storage: LanguageMemoryStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
        };

        expect(() => rememberFetchedLanguage("spa", storage)).not.toThrow();
    });

    test("does nothing without storage", () => {
        expect(() => rememberFetchedLanguage("spa", undefined)).not.toThrow();
    });
});
