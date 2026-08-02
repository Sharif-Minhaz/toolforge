import { describe, expect, test } from "bun:test";

import { HISTORY_STORAGE_KEYS, MAX_HISTORY_ENTRIES } from "@/modules/short-links/domain/constants";
import {
    clearHistory,
    forgetLink,
    historyStorageKey,
    readHistory,
    rememberLink,
    writeHistory,
    type HistoryStorage,
} from "@/modules/short-links/domain/history";
import {
    SHORT_LINK_TOOLS,
    type LinkHistoryEntry,
    type ShortLinkTool,
} from "@/modules/short-links/types";

/** The tool every single-tool assertion below is written against. */
const TOOL: ShortLinkTool = "shortener";

/**
 * A `Storage` stand-in, so none of this needs a DOM. It holds one value per key
 * rather than one value outright, which is what lets the per-tool isolation
 * test below mean anything.
 */
function fakeStorage(initial: string | null = null): HistoryStorage & {
    readonly values: Map<string, string>;
} {
    const values = new Map<string, string>();

    if (initial !== null) {
        values.set(historyStorageKey(TOOL), initial);
    }

    return {
        values,
        getItem(key) {
            return values.get(key) ?? null;
        },
        setItem(key, next) {
            values.set(key, next);
        },
        removeItem(key) {
            values.delete(key);
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
        expect(readHistory(TOOL, undefined)).toEqual([]);
    });

    test("nothing stored yet reads as an empty list", () => {
        expect(readHistory(TOOL, fakeStorage())).toEqual([]);
    });

    test("round-trips what was written", () => {
        const storage = fakeStorage();
        const entries = [entry("abcd2345"), entry("summer-sale")];

        writeHistory(TOOL, entries, storage);

        expect(readHistory(TOOL, storage)).toEqual(entries);
    });

    test("a hand-edited value degrades instead of throwing", () => {
        for (const raw of ["", "not json", "{}", '"a string"', "null", "42"]) {
            expect(readHistory(TOOL, fakeStorage(raw))).toEqual([]);
        }
    });

    test("one bad row does not cost the good ones", () => {
        const storage = fakeStorage(
            JSON.stringify([entry("abcd2345"), { slug: "broken" }, null, entry("summer-sale")]),
        );

        expect(readHistory(TOOL, storage).map((row) => row.slug)).toEqual([
            "abcd2345",
            "summer-sale",
        ]);
    });

    test("a row missing its edit link is dropped, not half-rendered", () => {
        const withoutEditUrl: Record<string, unknown> = { ...entry("abcd2345") };
        delete withoutEditUrl.editUrl;
        const storage = fakeStorage(JSON.stringify([withoutEditUrl]));

        expect(readHistory(TOOL, storage)).toEqual([]);
    });

    test("a nullable field may be null but not a number", () => {
        const storage = fakeStorage(
            JSON.stringify([
                entry("keeper", { expiresAt: "2026-09-01T00:00:00.000Z" }),
                { ...entry("dropped"), startsAt: 0 },
            ]),
        );

        expect(readHistory(TOOL, storage).map((row) => row.slug)).toEqual(["keeper"]);
    });

    test("a stored list longer than the cap is trimmed on the way out", () => {
        const overflowing = Array.from({ length: MAX_HISTORY_ENTRIES + 5 }, (_, index) =>
            entry(`slug-${index}`),
        );

        expect(readHistory(TOOL, fakeStorage(JSON.stringify(overflowing)))).toHaveLength(
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

        expect(readHistory(TOOL, throwing)).toEqual([]);
    });
});

describe("rememberLink", () => {
    test("puts the newest link first", () => {
        const storage = fakeStorage();

        rememberLink(TOOL, entry("first"), storage);
        const next = rememberLink(TOOL, entry("second"), storage);

        expect(next.map((row) => row.slug)).toEqual(["second", "first"]);
        expect(readHistory(TOOL, storage).map((row) => row.slug)).toEqual(["second", "first"]);
    });

    test("re-pointing a link updates its row rather than adding a second", () => {
        const storage = fakeStorage();

        rememberLink(TOOL, entry("abcd2345"), storage);
        rememberLink(TOOL, entry("other"), storage);
        const next = rememberLink(
            TOOL,
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
            rememberLink(TOOL, entry(`slug-${index}`), storage);
        }

        const stored = readHistory(TOOL, storage);

        expect(stored).toHaveLength(MAX_HISTORY_ENTRIES);
        expect(stored[0].slug).toBe(`slug-${MAX_HISTORY_ENTRIES}`);
        expect(stored.map((row) => row.slug)).not.toContain("slug-0");
    });

    test("a store that refuses writes still answers with the list it would have kept", () => {
        expect(rememberLink(TOOL, entry("abcd2345"), readOnlyStorage())).toHaveLength(1);
    });

    test("no storage at all is not an error", () => {
        expect(rememberLink(TOOL, entry("abcd2345"), undefined)).toEqual([entry("abcd2345")]);
    });
});

describe("forgetLink", () => {
    test("removes one row and leaves the rest", () => {
        const storage = fakeStorage();

        rememberLink(TOOL, entry("keep"), storage);
        rememberLink(TOOL, entry("drop"), storage);

        expect(forgetLink(TOOL, "drop", storage).map((row) => row.slug)).toEqual(["keep"]);
    });

    test("forgetting something that is not there changes nothing", () => {
        const storage = fakeStorage();

        rememberLink(TOOL, entry("keep"), storage);

        expect(forgetLink(TOOL, "absent", storage).map((row) => row.slug)).toEqual(["keep"]);
    });
});

describe("clearHistory", () => {
    test("empties the list, edit links and all", () => {
        const storage = fakeStorage();

        rememberLink(TOOL, entry("abcd2345"), storage);
        clearHistory(TOOL, storage);

        expect(storage.values.has(historyStorageKey(TOOL))).toBe(false);
        expect(readHistory(TOOL, storage)).toEqual([]);
    });

    test("survives a store that refuses to remove", () => {
        expect(() => clearHistory(TOOL, readOnlyStorage())).not.toThrow();
    });
});

describe("one list per tool", () => {
    test("every tool has its own key, and no two collide", () => {
        const keys = SHORT_LINK_TOOLS.map(historyStorageKey);

        expect(new Set(keys).size).toBe(keys.length);

        for (const tool of SHORT_LINK_TOOLS) {
            expect(historyStorageKey(tool)).toBe(HISTORY_STORAGE_KEYS[tool]);
        }
    });

    test("a code remembered by the QR tool never shows up in the shortener's list", () => {
        const storage = fakeStorage();

        rememberLink("qr", entry("printed"), storage);
        rememberLink("shortener", entry("shared"), storage);

        expect(readHistory("qr", storage).map((row) => row.slug)).toEqual(["printed"]);
        expect(readHistory("shortener", storage).map((row) => row.slug)).toEqual(["shared"]);
    });

    test("clearing one list leaves the other alone", () => {
        const storage = fakeStorage();

        rememberLink("qr", entry("printed"), storage);
        rememberLink("shortener", entry("shared"), storage);
        clearHistory("shortener", storage);

        expect(readHistory("qr", storage)).toHaveLength(1);
        expect(readHistory("shortener", storage)).toEqual([]);
    });
});
