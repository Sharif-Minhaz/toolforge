import { deviceConstraint } from "@/modules/tools/domain/media-devices";
import type { AudioReading, Processing } from "../types";

/** What every browser does unasked, and what a call app gets. */
export const DEFAULT_PROCESSING: Processing = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
};

/** Long enough to say a sentence and hear it back; the clip lives in memory. */
export const MAX_RECORDING_SECONDS = 30;

/**
 * The audio request. Processing values are bare booleans — preferences, not
 * `exact` — so a browser that cannot turn one off still opens the
 * microphone, and the report shows what it really applied.
 */
export function buildAudioConstraints(
    processing: Processing,
    deviceId: string | null,
): MediaTrackConstraints {
    return { ...deviceConstraint(deviceId), ...processing };
}

/** What the report reads off `getSettings()`. Structural, so tests pass plain objects. */
export type AudioSettingsLike = {
    readonly sampleRate?: unknown;
    readonly channelCount?: unknown;
    readonly echoCancellation?: unknown;
    readonly noiseSuppression?: unknown;
    readonly autoGainControl?: unknown;
};

function positiveNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The newer specification lets `echoCancellation` be a mode string (`"all"`,
 * `"remote-only"`) where it used to be `true`; off is still `false`.
 */
function appliedSwitch(value: unknown): boolean | null {
    if (typeof value === "boolean") {
        return value;
    }

    return typeof value === "string" ? true : null;
}

export function readAudioSettings(settings: AudioSettingsLike): AudioReading {
    return {
        sampleRate: positiveNumber(settings.sampleRate),
        channelCount: positiveNumber(settings.channelCount),
        processing: {
            echoCancellation: appliedSwitch(settings.echoCancellation),
            noiseSuppression: appliedSwitch(settings.noiseSuppression),
            autoGainControl: appliedSwitch(settings.autoGainControl),
        },
    };
}
