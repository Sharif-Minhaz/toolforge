import { describe, expect, test } from "bun:test";

import { HISTORY_STORAGE_KEY, MAX_HISTORY_ENTRIES } from "@/modules/shortener/domain/constants";
import {
    clearHistory,
    forgetLink,
    readHistory,
    rememberLink,
    writeHistory,
    type HistoryStorage,
} from "@/modules/shortener/domain/history";
import type { LinkHistoryEntry } from "@/modules/shortener/types";

/** A `Storage` stand-in, so none of this needs a DOM. */
function fakeStorage(initial: string | null = null): HistoryStorage & { value: string | null } {
    return {
        value: initial,
        getItem(key) {
            return key === HISTORY_STORAGE_KEY ? this.value : null;
        },
        setItem(key, next) {
            if (key === HISTORY_STORAGE_KEY) {
                this.value = next;
            }
        },
        removeItem(key) {
            if (key === HISTORY_STORAGE_KEY) {
                this.value = null;
            }
        },
    };
}

/** One that refuses every write, the way a full quota or a locked profile does. */
function readOnlyStorage(initial: string | null = null): HistoryStorage {
    return {
        getItem: () => initial,
        setItem() {
            throw new Error("QuotaExceededError");
        },
        removeItem() {
            throw new Error("SecurityError");
        },
    };
}

function entry(slug: string, overrides: Partial<LinkHistoryEntry> = {}): LinkHistoryEntry {
    return {
        slug,
        shortUrl: `https://toolforge.example/s/${slug}`,
        target: "https://example.com/promo",
        editUrl: `https://toolforge.example/tools/shortener/edit/${slug}-token`,
        hasPassword: false,
        startsAt: null,
        expiresAt: null,
        createdAt: "2026-08-02T12:00:00.000Z",
        ...overrides,
    };
}

describe("readHistory", () => {
    test("no storage at all reads as an empty list", () => {
        expect(readHistory(undefined)).toEqual([]);
    });

    test("nothing stored yet reads as an empty list", () => {
        expect(readHistory(fakeStorage())).toEqual([]);
    });

    test("round-trips what was written", () => {
        const storage = fakeStorage();
        const entries = [entry("abcd2345"), entry("summer-sale")];

        writeHistory(entries, storage);

        expect(readHistory(storage)).toEqual(entries);
    });

    test("a hand-edited value degrades instead of throwing", () => {
        for (const raw of ["", "not json", "{}", '"a string"', "null", "42"]) {
            expect(readHistory(fakeStorage(raw))).toEqual([]);
        }
    });

    test("one bad row does not cost the good ones", () => {
        const storage = fakeStorage(
            JSON.stringify([entry("abcd2345"), { slug: "broken" }, null, entry("summer-sale")]),
        );

        expect(readHistory(storage).map((row) => row.slug)).toEqual(["abcd2345", "summer-sale"]);
    });

    test("a row missing its edit link is dropped, not half-rendered", () => {
        const withoutEditUrl: Record<string, unknown> = { ...entry("abcd2345") };
        delete withoutEditUrl.editUrl;
        const storage = fakeStorage(JSON.stringify([withoutEditUrl]));

        expect(readHistory(storage)).toEqual([]);
    });

    test("a nullable field may be null but not a number", () => {
        const storage = fakeStorage(
            JSON.stringify([
                entry("keeper", { expiresAt: "2026-09-01T00:00:00.000Z" }),
                { ...entry("dropped"), startsAt: 0 },
            ]),
        );

        expect(readHistory(storage).map((row) => row.slug)).toEqual(["keeper"]);
    });

    test("a stored list longer than the cap is trimmed on the way out", () => {
        const overflowing = Array.from({ length: MAX_HISTORY_ENTRIES + 5 }, (_, index) =>
            entry(`slug-${index}`),
        );

        expect(readHistory(fakeStorage(JSON.stringify(overflowing)))).toHaveLength(
            MAX_HISTORY_ENTRIES,
        );
    });

    test("storage that throws on read is treated as absent", () => {
        const throwing: HistoryStorage = {
            getItem() {
                throw new Error("SecurityError");
            },
            setItem() {},
            removeItem() {},
        };

        expect(readHistory(throwing)).toEqual([]);
    });
});

describe("rememberLink", () => {
    test("puts the newest link first", () => {
        const storage = fakeStorage();

        rememberLink(entry("first"), storage);
        const next = rememberLink(entry("second"), storage);

        expect(next.map((row) => row.slug)).toEqual(["second", "first"]);
        expect(readHistory(storage).map((row) => row.slug)).toEqual(["second", "first"]);
    });

    test("re-pointing a link updates its row rather than adding a second", () => {
        const storage = fakeStorage();

        rememberLink(entry("abcd2345"), storage);
        rememberLink(entry("other"), storage);
        const next = rememberLink(
            entry("abcd2345", { target: "https://example.com/moved" }),
            storage,
        );

        expect(next).toHaveLength(2);
        expect(next[0].slug).toBe("abcd2345");
        expect(next[0].target).toBe("https://example.com/moved");
    });

    test("the oldest entry falls off once the cap is reached", () => {
        const storage = fakeStorage();

        for (let index = 0; index <= MAX_HISTORY_ENTRIES; index += 1) {
            rememberLink(entry(`slug-${index}`), storage);
        }

        const stored = readHistory(storage);

        expect(stored).toHaveLength(MAX_HISTORY_ENTRIES);
        expect(stored[0].slug).toBe(`slug-${MAX_HISTORY_ENTRIES}`);
        expect(stored.map((row) => row.slug)).not.toContain("slug-0");
    });

    test("a store that refuses writes still answers with the list it would have kept", () => {
        expect(rememberLink(entry("abcd2345"), readOnlyStorage())).toHaveLength(1);
    });

    test("no storage at all is not an error", () => {
        expect(rememberLink(entry("abcd2345"), undefined)).toEqual([entry("abcd2345")]);
    });
});

describe("forgetLink", () => {
    test("removes one row and leaves the rest", () => {
        const storage = fakeStorage();

        rememberLink(entry("keep"), storage);
        rememberLink(entry("drop"), storage);

        expect(forgetLink("drop", storage).map((row) => row.slug)).toEqual(["keep"]);
    });

    test("forgetting something that is not there changes nothing", () => {
        const storage = fakeStorage();

        rememberLink(entry("keep"), storage);

        expect(forgetLink("absent", storage).map((row) => row.slug)).toEqual(["keep"]);
    });
});

describe("clearHistory", () => {
    test("empties the list, edit links and all", () => {
        const storage = fakeStorage();

        rememberLink(entry("abcd2345"), storage);
        clearHistory(storage);

        expect(storage.value).toBeNull();
        expect(readHistory(storage)).toEqual([]);
    });

    test("survives a store that refuses to remove", () => {
        expect(() => clearHistory(readOnlyStorage())).not.toThrow();
    });
});
