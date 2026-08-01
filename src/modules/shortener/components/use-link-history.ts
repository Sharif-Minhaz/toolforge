"use client";

import { useCallback, useSyncExternalStore } from "react";

import { HISTORY_STORAGE_KEY } from "../domain/constants";
import { clearHistory, forgetLink, readHistory, rememberLink } from "../domain/history";
import type { LinkHistoryEntry } from "../types";

/**
 * The recent-links list, as a React store.
 *
 * `useSyncExternalStore` rather than state seeded from an effect, for two
 * reasons the alternatives get wrong. It hands React a separate server
 * snapshot, so the server render and the hydration pass both see an empty list
 * and hydration never mismatches — the same trick `useIsHydrated` uses. And it
 * subscribes to `storage`, so creating a link in one tab updates the list in
 * every other one instead of leaving a stale copy behind.
 *
 * The snapshot is cached at module scope because `getSnapshot` must return a
 * stable reference: reading and parsing storage on every call would hand React
 * a new array each time and spin forever.
 */

const EMPTY: readonly LinkHistoryEntry[] = [];

let snapshot: readonly LinkHistoryEntry[] = EMPTY;

let loaded = false;

const listeners = new Set<() => void>();

function refresh(next?: readonly LinkHistoryEntry[]): void {
    snapshot = next ?? readHistory();
    loaded = true;

    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    // Another tab wrote the list. `key === null` is a whole-storage clear,
    // which counts too.
    const onStorage = (event: StorageEvent) => {
        if (event.key === HISTORY_STORAGE_KEY || event.key === null) {
            refresh();
        }
    };

    window.addEventListener("storage", onStorage);

    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

function getSnapshot(): readonly LinkHistoryEntry[] {
    if (!loaded) {
        snapshot = readHistory();
        loaded = true;
    }

    return snapshot;
}

function getServerSnapshot(): readonly LinkHistoryEntry[] {
    return EMPTY;
}

export type LinkHistory = {
    readonly entries: readonly LinkHistoryEntry[];
    readonly remember: (entry: LinkHistoryEntry) => void;
    readonly forget: (slug: string) => void;
    readonly clear: () => void;
};

export function useLinkHistory(): LinkHistory {
    const entries = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const remember = useCallback((entry: LinkHistoryEntry) => {
        refresh(rememberLink(entry));
    }, []);

    const forget = useCallback((slug: string) => {
        refresh(forgetLink(slug));
    }, []);

    const clear = useCallback(() => {
        clearHistory();
        refresh(EMPTY);
    }, []);

    return { entries, remember, forget, clear };
}
