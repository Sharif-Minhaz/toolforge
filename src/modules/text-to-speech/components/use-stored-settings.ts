"use client";

import { useSyncExternalStore } from "react";

import {
    clearStoredSettings,
    readStoredSettings,
    SETTINGS_STORAGE_KEY,
    writeStoredSettings,
} from "../domain/settings-storage";
import type { SpeechSettings } from "../types";

/**
 * The kept settings, bound to React the way `docs/patterns/browser-persistence.md`
 * says: `useSyncExternalStore`, a server snapshot of "nothing kept", and a
 * module-level cached snapshot so `getSnapshot` returns a stable reference.
 */

let snapshot: SpeechSettings | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function refresh(next?: SpeechSettings | null): void {
    snapshot = next === undefined ? readStoredSettings() : next;
    loaded = true;

    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    // Another tab turning the switch on or off is reflected here too.
    const onStorage = (event: StorageEvent) => {
        if (event.key === SETTINGS_STORAGE_KEY || event.key === null) {
            refresh();
        }
    };

    window.addEventListener("storage", onStorage);

    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

function getSnapshot(): SpeechSettings | null {
    if (!loaded) {
        snapshot = readStoredSettings();
        loaded = true;
    }

    return snapshot;
}

function getServerSnapshot(): SpeechSettings | null {
    return null;
}

export type StoredSettings = {
    /** `null` while nothing is kept — the switch is off. */
    readonly stored: SpeechSettings | null;
    readonly keep: (settings: SpeechSettings) => void;
    readonly forget: () => void;
};

export function useStoredSettings(): StoredSettings {
    const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    return {
        stored,
        keep(settings) {
            writeStoredSettings(settings);
            refresh(settings);
        },
        forget() {
            clearStoredSettings();
            refresh(null);
        },
    };
}
