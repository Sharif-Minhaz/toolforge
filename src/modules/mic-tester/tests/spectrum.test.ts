import { describe, expect, test } from "bun:test";

import {
    SPECTRUM_BANDS,
    SPECTRUM_CEILING_DB,
    SPECTRUM_FLOOR_DB,
    SPECTRUM_MAX_HZ,
    SPECTRUM_MIN_HZ,
    spectrumBands,
    spectrumPosition,
} from "../domain/spectrum";

const SAMPLE_RATE = 48_000;
const BINS = 1024; // an FFT of 2048
const BIN_HZ = SAMPLE_RATE / 2 / BINS;

function binsWithTone(hz: number, db: number): Float32Array {
    const bins = new Float32Array(BINS).fill(SPECTRUM_FLOOR_DB - 20);

    bins[Math.round(hz / BIN_HZ)] = db;

    return bins;
}

describe("spectrumPosition", () => {
    test("runs 0 → 1 across the axis, evenly per decade", () => {
        expect(spectrumPosition(SPECTRUM_MIN_HZ)).toBe(0);
        expect(spectrumPosition(SPECTRUM_MAX_HZ)).toBeCloseTo(1, 12);
        expect(spectrumPosition(1000) - spectrumPosition(100)).toBeCloseTo(
            spectrumPosition(10_000) - spectrumPosition(1000),
            12,
        );
    });
});

describe("spectrumBands", () => {
    test("one height per band, all zero for silence", () => {
        const bands = spectrumBands(new Float32Array(BINS).fill(-Infinity), SAMPLE_RATE);

        expect(bands).toHaveLength(SPECTRUM_BANDS);
        expect(bands.every((height) => height === 0)).toBe(true);
    });

    test("a tone lights the band its frequency falls in, and only that", () => {
        const bands = spectrumBands(binsWithTone(1000, SPECTRUM_CEILING_DB), SAMPLE_RATE);
        const expected = Math.floor(spectrumPosition(1000) * SPECTRUM_BANDS);
        const lit = bands.flatMap((height, band) => (height > 0 ? [band] : []));

        expect(lit).toEqual([expected]);
        expect(bands[expected]).toBe(1);
    });

    test("maps the floor…ceiling dB range onto 0…1 and clamps", () => {
        const middle = (SPECTRUM_FLOOR_DB + SPECTRUM_CEILING_DB) / 2;
        const band = Math.floor(spectrumPosition(1000) * SPECTRUM_BANDS);

        expect(spectrumBands(binsWithTone(1000, middle), SAMPLE_RATE)[band]).toBeCloseTo(0.5, 9);
        expect(spectrumBands(binsWithTone(1000, 0), SAMPLE_RATE)[band]).toBe(1);
    });

    test("every low band narrower than a bin still shows that bin", () => {
        const bins = new Float32Array(BINS).fill(SPECTRUM_CEILING_DB);
        const bands = spectrumBands(bins, SAMPLE_RATE);

        expect(bands.every((height) => height === 1)).toBe(true);
    });

    test("bands above the Nyquist frequency are empty, not out of range", () => {
        // 16 kHz sampling: Nyquist at 8 kHz, below the top of the axis.
        const bins = new Float32Array(BINS).fill(SPECTRUM_CEILING_DB);
        const bands = spectrumBands(bins, 16_000);
        const firstAbove = Math.ceil(spectrumPosition(8000) * SPECTRUM_BANDS);

        expect(bands[firstAbove - 2]).toBe(1);
        expect(bands.slice(firstAbove + 1).every((height) => height === 0)).toBe(true);
    });
});
