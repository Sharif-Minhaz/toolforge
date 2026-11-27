import { describe, expect, test } from "bun:test";

import {
    PERSONAL_BEST_STORAGE_KEY,
    readPersonalBests,
    recordPersonalBest,
    type PersonalBestStorage,
} from "@/modules/tools/domain/personal-best";

function memoryStorage(initial?: string): PersonalBestStorage & { value: string | null } {
    const store = {
        value: initial ?? null,
        getItem: (key: string) => (key === PERSONAL_BEST_STORAGE_KEY ? store.value : null),
        setItem: (_key: string, next: string) => {
            store.value = next;
        },
    };

    return store;
}

describe("personal bests", () => {
    test("records a first best and only ever raises it", () => {
        const storage = memoryStorage();

        expect(recordPersonalBest("typing:english:60", 72, storage)).toEqual({
            "typing:english:60": 72,
        });
        expect(recordPersonalBest("typing:english:60", 60, storage)["typing:english:60"]).toBe(72);
        expect(recordPersonalBest("typing:english:60", 72, storage)["typing:english:60"]).toBe(72);
        expect(recordPersonalBest("typing:english:60", 80.5, storage)["typing:english:60"]).toBe(
            80.5,
        );
    });

    test("keys stay apart", () => {
        const storage = memoryStorage();
        recordPersonalBest("aim:small:30", 40, storage);
        recordPersonalBest("aim:large:30", 55, storage);

        expect(readPersonalBests(storage)).toEqual({ "aim:small:30": 40, "aim:large:30": 55 });
    });

    test("never records zero, a negative or a non-number", () => {
        const storage = memoryStorage();

        expect(recordPersonalBest("k", 0, storage)).toEqual({});
        expect(recordPersonalBest("k", -3, storage)).toEqual({});
        expect(recordPersonalBest("k", Number.NaN, storage)).toEqual({});
        expect(storage.value).toBeNull();
    });

    test("a corrupt or hand-edited entry degrades to no best", () => {
        expect(readPersonalBests(memoryStorage("not json"))).toEqual({});
        expect(readPersonalBests(memoryStorage("[1,2]"))).toEqual({});
        expect(readPersonalBests(memoryStorage('{"a":"fast","b":12,"c":-1}'))).toEqual({ b: 12 });
        expect(readPersonalBests(undefined)).toEqual({});
    });

    test("a failed write still returns the new best for this visit", () => {
        const storage: PersonalBestStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
        };

        expect(recordPersonalBest("k", 5, storage)).toEqual({ k: 5 });
    });
});
