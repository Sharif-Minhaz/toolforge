"use client";

import { useSyncExternalStore } from "react";

import {
    PERSONAL_BEST_STORAGE_KEY,
    readPersonalBests,
    recordPersonalBest,
    type PersonalBests,
} from "../domain/personal-best";

/**
 * Personal bests as a React store — the `use-recent-tools.ts` shape.
 *
 * The server snapshot is empty, so the prerendered page and the hydration pass
 * agree; a best appears once the client snapshot is read. The snapshot is
 * cached at module scope because `getSnapshot` must return a stable reference.
 */

const EMPTY: PersonalBests = {};
const listeners = new Set<() => void>();
let snapshot: PersonalBests | undefined;

function refresh(next?: PersonalBests): void {
    snapshot = next ?? readPersonalBests();
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    // Another tab set a best. `key === null` is a whole-storage clear.
    const onStorage = (event: StorageEvent) => {
        if (event.key === PERSONAL_BEST_STORAGE_KEY || event.key === null) {
            refresh();
        }
    };

    window.addEventListener("storage", onStorage);

    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

function getSnapshot(): PersonalBests {
    snapshot ??= readPersonalBests();

    return snapshot;
}

const getServerSnapshot = () => EMPTY;

export function usePersonalBests(): PersonalBests {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Saves `value` if it is a new best. Returns whether it was. */
export function savePersonalBest(key: string, value: number): boolean {
    const before = getSnapshot()[key] ?? 0;
    const next = recordPersonalBest(key, value);

    refresh(next);

    return (next[key] ?? 0) > before;
}
