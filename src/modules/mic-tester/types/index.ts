/**
 * The browser's own voice processing, by the constraint names `getUserMedia`
 * takes. Each is on by default in every browser, as a call would have it.
 */
export const PROCESSING_OPTIONS = [
    "echoCancellation",
    "noiseSuppression",
    "autoGainControl",
] as const;

export type ProcessingOption = (typeof PROCESSING_OPTIONS)[number];

export type Processing = Readonly<Record<ProcessingOption, boolean>>;

/** One published meter reading, in dBFS. `-Infinity` is digital silence. */
export type Level = {
    readonly rmsDbfs: number;
    readonly peakDbfs: number;
};

/** The word beside the meter, so the level never rests on colour alone. */
export type LevelVerdict = "silent" | "quiet" | "good" | "clipping";

/** What `track.getSettings()` says the browser actually opened. `null` is "not reported". */
export type AudioReading = {
    readonly sampleRate: number | null;
    readonly channelCount: number | null;
    readonly processing: Readonly<Record<ProcessingOption, boolean | null>>;
};
