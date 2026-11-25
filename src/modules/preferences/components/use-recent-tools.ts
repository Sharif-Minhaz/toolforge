"use client";

import { useSyncExternalStore } from "react";

import {
    forgetRecentTool,
    RECENT_TOOLS_STORAGE_KEY,
    readRecentTools,
    rememberRecentTool,
} from "../domain/recent-tools";

/**
 * The recent-tools list as a React store — the `use-link-history.ts` shape.
 *
 * The server snapshot is empty, so the prerendered rail and the hydration pass
 * agree; the section appears once the client snapshot is read. The snapshot is
 * cached at module scope because `getSnapshot` must return a stable reference.
 */

const EMPTY: readonly string[] = [];
const listeners = new Set<() => void>();
let snapshot: readonly string[] | undefined;

function refresh(next?: readonly string[]): void {
    snapshot = next ?? readRecentTools();
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    // Another tab visited a tool. `key === null` is a whole-storage clear.
    const onStorage = (event: StorageEvent) => {
        if (event.key === RECENT_TOOLS_STORAGE_KEY || event.key === null) {
            refresh();
        }
    };

    window.addEventListener("storage", onStorage);

    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

function getSnapshot(): readonly string[] {
    snapshot ??= readRecentTools();

    return snapshot;
}

const getServerSnapshot = () => EMPTY;

export function useRecentToolIds(): readonly string[] {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function recordRecentTool(id: string): void {
    refresh(rememberRecentTool(id));
}

export function removeRecentTool(id: string): void {
    refresh(forgetRecentTool(id));
}
