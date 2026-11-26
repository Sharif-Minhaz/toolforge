import type { Level, LevelVerdict } from "../types";

/** The meter's scale runs from here to 0 dBFS. */
export const METER_FLOOR_DBFS = -60;

/** A peak this close to full scale is a sample at the converter's limit. */
export const CLIP_DBFS = -0.1;

/** Below this RMS nothing is reaching the microphone: a muted input, or the wrong one. */
export const SILENT_DBFS = -60;

/** Below this RMS a voice is too quiet for a call to carry well. */
export const QUIET_DBFS = -40;

/** How long the peak marker stays put before it starts to fall. */
export const PEAK_HOLD_MS = 1500;

export const PEAK_DECAY_DB_PER_SECOND = 20;

/** How often the readout changes. Faster than this the numbers cannot be read. */
export const READING_INTERVAL_MS = 100;

/**
 * Amplitude to dBFS, relative to a full-scale square wave — so a full-scale
 * sine reads −3.01, as in most software meters. Zero is `-Infinity`.
 */
export function toDbfs(amplitude: number): number {
    return 20 * Math.log10(Math.abs(amplitude));
}

/** Samples gathered between two published readings. */
export type LevelWindow = {
    readonly sumOfSquares: number;
    readonly count: number;
    /** Largest absolute sample. */
    readonly peak: number;
};

export const EMPTY_WINDOW: LevelWindow = { sumOfSquares: 0, count: 0, peak: 0 };

/**
 * Folds one analyser buffer into the window, so a transient between two
 * readings still reaches the peak instead of falling between them.
 */
export function addSamples(window: LevelWindow, samples: ArrayLike<number>): LevelWindow {
    let sumOfSquares = window.sumOfSquares;
    let peak = window.peak;

    for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];

        sumOfSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
    }

    return { sumOfSquares, count: window.count + samples.length, peak };
}

export function readLevel(window: LevelWindow): Level {
    const rms = window.count === 0 ? 0 : Math.sqrt(window.sumOfSquares / window.count);

    return { rmsDbfs: toDbfs(rms), peakDbfs: toDbfs(window.peak) };
}

/** The highest recent peak and when it arrived. */
export type PeakHold = {
    readonly dbfs: number;
    readonly at: number;
};

/** Where the held peak stands at `now`: still for the hold time, then falling. */
export function heldPeakDbfs(hold: PeakHold, now: number): number {
    const falling = Math.max(0, now - hold.at - PEAK_HOLD_MS);

    return hold.dbfs - (falling / 1000) * PEAK_DECAY_DB_PER_SECOND;
}

/** A new peak at or above the marker replaces it; anything lower leaves it to fall. */
export function holdPeak(hold: PeakHold | null, peakDbfs: number, now: number): PeakHold {
    return hold === null || peakDbfs >= heldPeakDbfs(hold, now)
        ? { dbfs: peakDbfs, at: now }
        : hold;
}

/** 0–1 along the meter, for the bar and the peak marker. */
export function meterFraction(dbfs: number): number {
    return Math.min(1, Math.max(0, (dbfs - METER_FLOOR_DBFS) / -METER_FLOOR_DBFS));
}

/**
 * Clipping is judged on the held peak, so a single clipped sample stays
 * reported long enough to be read.
 */
export function judgeLevel(level: Level, heldPeak: number): LevelVerdict {
    if (heldPeak >= CLIP_DBFS) {
        return "clipping";
    }

    if (level.rmsDbfs < SILENT_DBFS) {
        return "silent";
    }

    return level.rmsDbfs < QUIET_DBFS ? "quiet" : "good";
}
