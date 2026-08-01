import type { LinkHistoryEntry } from "../types";
import { HISTORY_STORAGE_KEY, MAX_HISTORY_ENTRIES } from "./constants";

/**
 * The recent-links list, kept in this browser and nowhere else.
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
    storage: HistoryStorage | undefined = browserStorage(),
): readonly LinkHistoryEntry[] {
    if (!storage) {
        return EMPTY;
    }

    let raw: string | null;

    try {
        raw = storage.getItem(HISTORY_STORAGE_KEY);
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
    entries: readonly LinkHistoryEntry[],
    storage: HistoryStorage | undefined = browserStorage(),
): void {
    if (!storage) {
        return;
    }

    try {
        storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // Quota exceeded, or a private window that refuses writes.
    }
}

/**
 * Adds a link to the front of the list, replacing any earlier entry for the
 * same slug — re-pointing a link should update its row, not grow a second one.
 */
export function rememberLink(
    entry: LinkHistoryEntry,
    storage: HistoryStorage | undefined = browserStorage(),
): readonly LinkHistoryEntry[] {
    const next = [
        entry,
        ...readHistory(storage).filter((existing) => existing.slug !== entry.slug),
    ].slice(0, MAX_HISTORY_ENTRIES);

    writeHistory(next, storage);

    return next;
}

export function forgetLink(
    slug: string,
    storage: HistoryStorage | undefined = browserStorage(),
): readonly LinkHistoryEntry[] {
    const next = readHistory(storage).filter((entry) => entry.slug !== slug);

    writeHistory(next, storage);

    return next;
}

/** Empties the list, including every edit link in it. */
export function clearHistory(storage: HistoryStorage | undefined = browserStorage()): void {
    if (!storage) {
        return;
    }

    try {
        storage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
        // Nothing to do — the caller renders an empty list either way.
    }
}
