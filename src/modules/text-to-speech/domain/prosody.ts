import type { ProsodyControl, SpeechSettings } from "../types";
import { DEFAULT_SPEECH_SETTINGS, PROSODY_MAX, PROSODY_MIN } from "./constants";

/**
 * The three sliders, as the strings the service's `<prosody>` element reads.
 *
 * Relative values only — `+20%`, `-10Hz` — which the service applies to each
 * voice's own baseline. An absolute pitch would put every voice on one note.
 */

const UNITS: Readonly<Record<ProsodyControl, string>> = {
    rate: "%",
    volume: "%",
    pitch: "Hz",
};

export function clampProsody(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(PROSODY_MAX, Math.max(PROSODY_MIN, Math.round(value)));
}

/** `0` → `+0%`. The sign is always written; the service reads a bare `0` as absolute. */
export function formatProsodyValue(control: ProsodyControl, value: number): string {
    const clamped = clampProsody(value);
    const sign = clamped < 0 ? "-" : "+";

    return `${sign}${Math.abs(clamped)}${UNITS[control]}`;
}

export type ProsodyStrings = Readonly<Record<ProsodyControl, string>>;

export function toProsodyStrings(settings: SpeechSettings): ProsodyStrings {
    return {
        rate: formatProsodyValue("rate", settings.rate),
        volume: formatProsodyValue("volume", settings.volume),
        pitch: formatProsodyValue("pitch", settings.pitch),
    };
}

export function isDefaultSettings(settings: SpeechSettings): boolean {
    return (
        settings.rate === DEFAULT_SPEECH_SETTINGS.rate &&
        settings.volume === DEFAULT_SPEECH_SETTINGS.volume &&
        settings.pitch === DEFAULT_SPEECH_SETTINGS.pitch
    );
}
