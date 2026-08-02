"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
    clearHistory,
    forgetLink,
    historyStorageKey,
    readHistory,
    rememberLink,
} from "../domain/history";
import type { LinkHistoryEntry, ShortLinkTool } from "../types";

/**
 * One tool's recent-links list, as a React store.
 *
 * `useSyncExternalStore` rather than state seeded from an effect, for two
 * reasons the alternatives get wrong. It hands React a separate server
 * snapshot, so the server render and the hydration pass both see an empty list
 * and hydration never mismatches — the same trick `useIsHydrated` uses. And it
 * subscribes to `storage`, so creating a link in one tab updates the list in
 * every other one instead of leaving a stale copy behind.
 *
 * Each snapshot is cached at module scope, keyed by tool, because `getSnapshot`
 * must return a stable reference: reading and parsing storage on every call
 * would hand React a new array each time and spin forever.
 */

const EMPTY: readonly LinkHistoryEntry[] = [];

type Store = {
    snapshot: readonly LinkHistoryEntry[];
    loaded: boolean;
    readonly listeners: Set<() => void>;
};

const STORES = new Map<ShortLinkTool, Store>();

function storeFor(tool: ShortLinkTool): Store {
    const existing = STORES.get(tool);

    if (existing !== undefined) {
        return existing;
    }

    const created: Store = { snapshot: EMPTY, loaded: false, listeners: new Set() };
    STORES.set(tool, created);

    return created;
}

function refresh(tool: ShortLinkTool, next?: readonly LinkHistoryEntry[]): void {
    const store = storeFor(tool);

    store.snapshot = next ?? readHistory(tool);
    store.loaded = true;

    for (const listener of store.listeners) {
        listener();
    }
}

export type LinkHistory = {
    readonly entries: readonly LinkHistoryEntry[];
    readonly remember: (entry: LinkHistoryEntry) => void;
    readonly forget: (slug: string) => void;
    readonly clear: () => void;
};

export function useLinkHistory(tool: ShortLinkTool): LinkHistory {
    // Rebuilt only when the tool changes, so `useSyncExternalStore` is not
    // handed a new `subscribe` on every render — which would tear the
    // subscription down and put it back up each time.
    const store = useMemo(
        () => ({
            subscribe(listener: () => void) {
                const target = storeFor(tool);
                target.listeners.add(listener);

                // Another tab wrote this tool's list. `key === null` is a
                // whole-storage clear, which counts too.
                const onStorage = (event: StorageEvent) => {
                    if (event.key === historyStorageKey(tool) || event.key === null) {
                        refresh(tool);
                    }
                };

                window.addEventListener("storage", onStorage);

                return () => {
                    target.listeners.delete(listener);
                    window.removeEventListener("storage", onStorage);
                };
            },
            getSnapshot() {
                const target = storeFor(tool);

                if (!target.loaded) {
                    target.snapshot = readHistory(tool);
                    target.loaded = true;
                }

                return target.snapshot;
            },
            getServerSnapshot(): readonly LinkHistoryEntry[] {
                return EMPTY;
            },
        }),
        [tool],
    );

    const entries = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getServerSnapshot,
    );

    const remember = useCallback(
        (entry: LinkHistoryEntry) => {
            refresh(tool, rememberLink(tool, entry));
        },
        [tool],
    );

    const forget = useCallback(
        (slug: string) => {
            refresh(tool, forgetLink(tool, slug));
        },
        [tool],
    );

    const clear = useCallback(() => {
        clearHistory(tool);
        refresh(tool, EMPTY);
    }, [tool]);

    return { entries, remember, forget, clear };
}
