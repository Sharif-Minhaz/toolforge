/**
 * The spectrum view: analyser bins grouped into bands spaced evenly on a
 * logarithmic axis, which is how an ear spaces pitch. Linear bins would give
 * the top half of the picture to the octave above 12 kHz.
 */
export const SPECTRUM_MIN_HZ = 50;

/**
 * The top of the axis. Every audio context this runs in samples at 32 kHz or
 * more, so the axis is fixed and its labels can be drawn on the server; a band
 * above the Nyquist frequency is simply empty.
 */
export const SPECTRUM_MAX_HZ = 16_000;

/** dB that maps to the bottom and the top of the view. */
export const SPECTRUM_FLOOR_DB = -100;
export const SPECTRUM_CEILING_DB = -20;

export const SPECTRUM_BANDS = 64;

/** Axis labels, as frequencies; the page formats them. */
export const SPECTRUM_TICKS_HZ = [100, 1000, 10_000] as const;

/** 0–1 along the axis for a frequency. */
export function spectrumPosition(hz: number): number {
    return Math.log(hz / SPECTRUM_MIN_HZ) / Math.log(SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ);
}

/**
 * `getFloatFrequencyData` output (dB per bin, bin 0 at 0 Hz) → one 0–1 height
 * per band, each the loudest bin it covers. A band narrower than a bin repeats
 * that bin rather than going blank, which is what the low end looks like at an
 * FFT of 2048.
 */
export function spectrumBands(
    bins: ArrayLike<number>,
    sampleRate: number,
    bandCount = SPECTRUM_BANDS,
): readonly number[] {
    const binHz = sampleRate / 2 / bins.length;
    const span = SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ;

    return Array.from({ length: bandCount }, (_, band) => {
        const low = SPECTRUM_MIN_HZ * span ** (band / bandCount);
        const high = SPECTRUM_MIN_HZ * span ** ((band + 1) / bandCount);
        const first = Math.floor(low / binHz);
        const last = Math.min(bins.length - 1, Math.max(first, Math.ceil(high / binHz) - 1));
        let loudest = -Infinity;

        for (let index = first; index <= last; index += 1) {
            loudest = Math.max(loudest, bins[index]);
        }

        const height = (loudest - SPECTRUM_FLOOR_DB) / (SPECTRUM_CEILING_DB - SPECTRUM_FLOOR_DB);

        return Math.min(1, Math.max(0, height));
    });
}
