import { HISTORY_STORAGE_KEYS, MAX_HISTORY_ENTRIES } from "./constants";
import type { LinkHistoryEntry, ShortLinkTool } from "../types";

/**
 * The recent-links list, kept in this browser and nowhere else.
 *
 * One list per tool, under its own key: a QR code and a shortened URL are the
 * same row in the database, but they are two different things to the person who
 * made them, and a single merged list would put a poster and a campaign link in
 * the same pile.
 *
 * Storage arrives as a parameter with a browser default, the same shape
 * `tools/domain/clipboard.ts` uses, so every branch below is reachable from a
 * test without a DOM — including the ones that matter most: a quota-full store,
 * and a value somebody edited by hand.
 */

/** The minimal surface of `Storage` this module depends on. */
export type HistoryStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

function browserStorage(): HistoryStorage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        // Reading `localStorage` throws outright when storage is blocked by
        // policy, which is a supported way to browse rather than an error.
        return undefined;
    }
}

const EMPTY: readonly LinkHistoryEntry[] = [];

export function historyStorageKey(tool: ShortLinkTool): string {
    return HISTORY_STORAGE_KEYS[tool];
}

function isEntry(value: unknown): value is LinkHistoryEntry {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    const strings = ["slug", "shortUrl", "target", "editUrl", "createdAt"];
    const nullableStrings = ["startsAt", "expiresAt"];

    return (
        strings.every((key) => typeof entry[key] === "string") &&
        nullableStrings.every((key) => entry[key] === null || typeof entry[key] === "string") &&
        typeof entry.hasPassword === "boolean"
    );
}

/**
 * Whatever is in storage, filtered down to entries this version understands.
 *
 * Every failure — absent, unparseable, an object where an array belongs, one
 * bad row among good ones — degrades to what can still be read. A list of
 * convenience is never worth throwing a page away for.
 */
export function readHistory(
    tool: ShortLinkTool,
    storage: HistoryStorage | undefined = browserStorage(),
): readonly LinkHistoryEntry[] {
    if (!storage) {
        return EMPTY;
    }

    let raw: string | null;

    try {
        raw = storage.getItem(historyStorageKey(tool));
    } catch {
        return EMPTY;
    }

    if (raw === null) {
        return EMPTY;
    }

    try {
        const parsed: unknown = JSON.parse(raw);

        return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_HISTORY_ENTRIES) : EMPTY;
    } catch {
        return EMPTY;
    }
}

/** Silent on failure: a full quota must not stop a link from being created. */
export function writeHistory(
    tool: ShortLinkTool,
    entries: readonly LinkHistoryEntry[],
    storage: HistoryStorage | undefined = browserStorage(),
): void {
    if (!storage) {
        return;
    }

    try {
        storage.setItem(historyStorageKey(tool), JSON.stringify(entries));
    } catch {
        // Quota exceeded, or a private window that refuses writes.
    }
}

/**
 * Adds a link to the front of the list, replacing any earlier entry for the
 * same slug — re-pointing a link should update its row, not grow a second one.
 */
export function rememberLink(
    tool: ShortLinkTool,
    entry: LinkHistoryEntry,
    storage: HistoryStorage | undefined = browserStorage(),
): readonly LinkHistoryEntry[] {
    const next = [
        entry,
        ...readHistory(tool, storage).filter((existing) => existing.slug !== entry.slug),
    ].slice(0, MAX_HISTORY_ENTRIES);

    writeHistory(tool, next, storage);

    return next;
}

export function forgetLink(
    tool: ShortLinkTool,
    slug: string,
    storage: HistoryStorage | undefined = browserStorage(),
): readonly LinkHistoryEntry[] {
    const next = readHistory(tool, storage).filter((entry) => entry.slug !== slug);

    writeHistory(tool, next, storage);

    return next;
}

/** Empties one tool's list, including every edit link in it. */
export function clearHistory(
    tool: ShortLinkTool,
    storage: HistoryStorage | undefined = browserStorage(),
): void {
    if (!storage) {
        return;
    }

    try {
        storage.removeItem(historyStorageKey(tool));
    } catch {
        // Nothing to do — the caller renders an empty list either way.
    }
}
