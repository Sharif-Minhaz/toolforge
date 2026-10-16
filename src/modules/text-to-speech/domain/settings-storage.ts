import type { SpeechSettings } from "../types";
import { clampProsody } from "./prosody";

/**
 * The voice settings a reader asked this browser to keep.
 *
 * The shape `docs/patterns/browser-persistence.md` describes: storage is a
 * parameter with a browser default, and every read is total. Presence of the
 * key *is* the "keep my settings" switch — there is no separate flag to drift
 * out of step with the values, and turning the switch off is deleting the key.
 */

export const SETTINGS_STORAGE_KEY = "toolforge:text-to-speech:settings";

export type SettingsStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

function browserStorage(): SettingsStorage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        return undefined;
    }
}

function readNumber(record: Record<string, unknown>, key: string): number {
    const value = record[key];

    return typeof value === "number" ? clampProsody(value) : 0;
}

/**
 * `null` when nothing is kept — or when what is kept cannot be read, which is
 * the same answer: the switch shows off and the sliders start at zero. A field
 * that is missing or out of range reads as its default rather than discarding
 * the other two.
 */
export function readStoredSettings(
    storage: SettingsStorage | undefined = browserStorage(),
): SpeechSettings | null {
    if (!storage) {
        return null;
    }

    let raw: string | null;

    try {
        raw = storage.getItem(SETTINGS_STORAGE_KEY);
    } catch {
        return null;
    }

    if (raw === null) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(raw);

        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return null;
        }

        const record = parsed as Record<string, unknown>;

        return {
            rate: readNumber(record, "rate"),
            volume: readNumber(record, "volume"),
            pitch: readNumber(record, "pitch"),
        };
    } catch {
        return null;
    }
}

/** Best effort: a full or blocked storage leaves the settings working for this visit. */
export function writeStoredSettings(
    settings: SpeechSettings,
    storage: SettingsStorage | undefined = browserStorage(),
): void {
    try {
        storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Nothing to tell the reader that the switch does not already show.
    }
}

export function clearStoredSettings(storage: SettingsStorage | undefined = browserStorage()): void {
    try {
        storage?.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
        // As above.
    }
}
