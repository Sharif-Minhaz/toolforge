import { expect, test } from "bun:test";

import {
    forgetRecentTool,
    MAX_RECENT_TOOLS,
    RECENT_TOOLS_STORAGE_KEY,
    readRecentTools,
    rememberRecentTool,
    type RecentToolsStorage,
} from "./recent-tools";

function memoryStorage(initial?: string): RecentToolsStorage & { value: string | null } {
    return {
        value: initial ?? null,
        getItem(key) {
            return key === RECENT_TOOLS_STORAGE_KEY ? this.value : null;
        },
        setItem(_key, value) {
            this.value = value;
        },
    };
}

test("reads nothing from empty, unparseable or wrongly shaped storage", () => {
    expect(readRecentTools(undefined)).toEqual([]);
    expect(readRecentTools(memoryStorage())).toEqual([]);
    expect(readRecentTools(memoryStorage("{not json"))).toEqual([]);
    expect(readRecentTools(memoryStorage('{"uuid":true}'))).toEqual([]);
});

test("keeps the readable ids of a hand-edited list, once each", () => {
    expect(readRecentTools(memoryStorage('["uuid", 4, null, "jwt", "uuid"]'))).toEqual([
        "uuid",
        "jwt",
    ]);
});

test("remembering moves a tool to the front without duplicating it", () => {
    const storage = memoryStorage();
    rememberRecentTool("uuid", storage);
    rememberRecentTool("jwt", storage);

    expect(rememberRecentTool("uuid", storage)).toEqual(["uuid", "jwt"]);
    expect(readRecentTools(storage)).toEqual(["uuid", "jwt"]);
});

test("forgetting drops only that tool, and a later visit brings it back", () => {
    const storage = memoryStorage('["uuid", "jwt", "qr"]');

    expect(forgetRecentTool("jwt", storage)).toEqual(["uuid", "qr"]);
    expect(readRecentTools(storage)).toEqual(["uuid", "qr"]);
    expect(rememberRecentTool("jwt", storage)).toEqual(["jwt", "uuid", "qr"]);
});

test("keeps one spare beyond what the sidebar shows", () => {
    const storage = memoryStorage();
    const ids = Array.from({ length: MAX_RECENT_TOOLS + 3 }, (_, index) => `tool-${index}`);
    ids.forEach((id) => rememberRecentTool(id, storage));

    expect(readRecentTools(storage)).toEqual(ids.reverse().slice(0, MAX_RECENT_TOOLS + 1));
});

test("a refused write still returns the new list", () => {
    const storage: RecentToolsStorage = {
        getItem: () => null,
        setItem: () => {
            throw new Error("QuotaExceededError");
        },
    };

    expect(rememberRecentTool("uuid", storage)).toEqual(["uuid"]);
});
