import { describe, expect, test } from "bun:test";

import {
    bestFetchedQuality,
    CUTOUT_MEMORY_KEY,
    readFetchedQualities,
    rememberFetchedQuality,
    resolveStartingQuality,
    type CutoutMemoryStorage,
} from "@/modules/tools/domain/cutout-memory";

function fakeStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    const storage: CutoutMemoryStorage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => {
            store.set(key, value);
        },
    };

    return { storage, store };
}

describe("readFetchedQualities", () => {
    test("is empty with no storage, no key, or nonsense in it", () => {
        expect(readFetchedQualities(undefined)).toEqual([]);
        expect(readFetchedQualities(fakeStorage().storage)).toEqual([]);
        expect(readFetchedQualities(fakeStorage({ [CUTOUT_MEMORY_KEY]: "{" }).storage)).toEqual([]);
        expect(
            readFetchedQualities(fakeStorage({ [CUTOUT_MEMORY_KEY]: '{"a":1}' }).storage),
        ).toEqual([]);
    });

    test("keeps only tiers this version knows, once each", () => {
        const { storage } = fakeStorage({
            [CUTOUT_MEMORY_KEY]: '["fast","ultra","fast","best",3]',
        });

        expect(readFetchedQualities(storage)).toEqual(["fast", "best"]);
    });

    test("survives a storage that throws on read", () => {
        const storage: CutoutMemoryStorage = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {},
        };

        expect(readFetchedQualities(storage)).toEqual([]);
    });
});

describe("bestFetchedQuality", () => {
    test("picks the heaviest tier on the machine", () => {
        const { storage } = fakeStorage({ [CUTOUT_MEMORY_KEY]: '["fast","balanced"]' });

        expect(bestFetchedQuality(storage)).toBe("balanced");
    });

    test("is null when nothing has been fetched", () => {
        expect(bestFetchedQuality(fakeStorage().storage)).toBeNull();
    });
});

describe("resolveStartingQuality", () => {
    const { storage } = fakeStorage({ [CUTOUT_MEMORY_KEY]: '["best"]' });

    test("a link's own choice wins over what is cached", () => {
        expect(resolveStartingQuality("fast", "balanced", storage)).toBe("fast");
    });

    test("otherwise the best cached tier wins over the default", () => {
        expect(resolveStartingQuality(null, "balanced", storage)).toBe("best");
    });

    test("and the default stands when nothing is cached", () => {
        expect(resolveStartingQuality(null, "balanced", fakeStorage().storage)).toBe("balanced");
    });
});

describe("rememberFetchedQuality", () => {
    test("appends, and does not repeat itself", () => {
        const { storage, store } = fakeStorage();

        rememberFetchedQuality("fast", storage);
        rememberFetchedQuality("best", storage);
        rememberFetchedQuality("fast", storage);

        expect(JSON.parse(store.get(CUTOUT_MEMORY_KEY) ?? "[]")).toEqual(["fast", "best"]);
    });

    test("swallows a full or blocked store rather than failing the cut-out", () => {
        const storage: CutoutMemoryStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
        };

        expect(() => rememberFetchedQuality("balanced", storage)).not.toThrow();
    });

    test("does nothing without storage", () => {
        expect(() => rememberFetchedQuality("balanced", undefined)).not.toThrow();
    });
});
