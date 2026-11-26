import { describe, expect, test } from "bun:test";

import {
    addSamples,
    CLIP_DBFS,
    EMPTY_WINDOW,
    heldPeakDbfs,
    holdPeak,
    judgeLevel,
    meterFraction,
    PEAK_DECAY_DB_PER_SECOND,
    PEAK_HOLD_MS,
    readLevel,
    toDbfs,
} from "../domain/level";

function sine(amplitude: number, length = 48_000, cycles = 1000): Float32Array {
    return Float32Array.from({ length }, (_, index) =>
        Math.fround(amplitude * Math.sin((2 * Math.PI * cycles * index) / length)),
    );
}

function twoTonesAndDc(): Float32Array {
    return Float32Array.from({ length: 48_000 }, (_, index) =>
        Math.fround(
            0.3 * Math.sin((2 * Math.PI * 440 * index) / 48_000) +
                0.2 * Math.sin((2 * Math.PI * 1234.5 * index) / 48_000) +
                0.05,
        ),
    );
}

/** A fixed linear congruential sequence, so the pinned figures stay reproducible. */
function noise(): Float32Array {
    let seed = 1;

    return Float32Array.from({ length: 48_000 }, () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;

        return Math.fround(0.25 * ((seed / 2147483648) * 2 - 1));
    });
}

describe("toDbfs", () => {
    test("full scale is 0, half is about −6, silence is −∞", () => {
        expect(toDbfs(1)).toBe(0);
        expect(toDbfs(-1)).toBe(0);
        expect(toDbfs(0.5)).toBeCloseTo(-6.0206, 4);
        expect(toDbfs(0)).toBe(-Infinity);
    });
});

describe("readLevel", () => {
    test("a full-scale sine reads −3.01 dBFS RMS and 0 dBFS peak", () => {
        const level = readLevel(addSamples(EMPTY_WINDOW, sine(1)));

        expect(level.rmsDbfs).toBeCloseTo(-3.0103, 3);
        expect(level.peakDbfs).toBeCloseTo(0, 3);
    });

    test("a full-scale square reads 0 dBFS RMS", () => {
        const square = Float32Array.from({ length: 1000 }, (_, index) =>
            index % 2 === 0 ? 1 : -1,
        );

        expect(readLevel(addSamples(EMPTY_WINDOW, square)).rmsDbfs).toBeCloseTo(0, 6);
    });

    test("an empty or silent window is −∞, not NaN", () => {
        expect(readLevel(EMPTY_WINDOW)).toEqual({ rmsDbfs: -Infinity, peakDbfs: -Infinity });
        expect(readLevel(addSamples(EMPTY_WINDOW, new Float32Array(512)))).toEqual({
            rmsDbfs: -Infinity,
            peakDbfs: -Infinity,
        });
    });

    test("a transient in an earlier buffer survives into the window's peak", () => {
        const spike = new Float32Array(256);

        spike[10] = -0.9;
        const window = addSamples(addSamples(EMPTY_WINDOW, spike), new Float32Array(256));

        expect(window.count).toBe(512);
        expect(readLevel(window).peakDbfs).toBeCloseTo(toDbfs(0.9), 6);
    });

    /**
     * Pinned from FFmpeg's `astats` filter (`RMS level dB`, `Peak level dB`)
     * over the same float32 samples written as raw `f32le` — a meter that is
     * not this one. All six agreed to the sixth decimal.
     */
    test.each([
        ["sine 1.0", sine(1), -3.0103, 0],
        ["sine 0.5", sine(0.5), -9.0309, -6.0206],
        ["sine 0.1", sine(0.1), -23.0103, -20.0],
        ["sine 0.01", sine(0.01), -43.0103, -40.0],
        ["two tones and DC", twoTonesAndDc(), -11.706631, -5.194783],
        ["noise", noise(), -16.75983, -12.04131],
    ])("%s matches FFmpeg astats", (_, samples, rms, peak) => {
        const level = readLevel(addSamples(EMPTY_WINDOW, samples));

        expect(level.rmsDbfs).toBeCloseTo(rms, 5);
        expect(level.peakDbfs).toBeCloseTo(peak, 5);
    });
});

describe("peak hold", () => {
    test("holds still, then falls at the decay rate", () => {
        const hold = holdPeak(null, -10, 0);

        expect(heldPeakDbfs(hold, PEAK_HOLD_MS)).toBe(-10);
        expect(heldPeakDbfs(hold, PEAK_HOLD_MS + 500)).toBeCloseTo(
            -10 - PEAK_DECAY_DB_PER_SECOND / 2,
            9,
        );
    });

    test("a lower peak leaves the marker; a higher one replaces it", () => {
        const hold = holdPeak(null, -10, 0);

        expect(holdPeak(hold, -20, 100)).toBe(hold);
        expect(holdPeak(hold, -5, 100)).toEqual({ dbfs: -5, at: 100 });
    });

    test("a peak above the falling marker catches it, not the original", () => {
        const hold = holdPeak(null, -10, 0);
        const now = PEAK_HOLD_MS + 1000; // marker now at −30

        expect(holdPeak(hold, -25, now)).toEqual({ dbfs: -25, at: now });
        expect(holdPeak(hold, -35, now)).toBe(hold);
    });

    test("silence after silence stays −∞", () => {
        const hold = holdPeak(null, -Infinity, 0);

        expect(heldPeakDbfs(holdPeak(hold, -Infinity, 5000), 6000)).toBe(-Infinity);
    });
});

describe("meterFraction", () => {
    test("maps −60…0 dBFS onto 0…1 and clamps outside it", () => {
        expect(meterFraction(0)).toBe(1);
        expect(meterFraction(-30)).toBe(0.5);
        expect(meterFraction(-60)).toBe(0);
        expect(meterFraction(-90)).toBe(0);
        expect(meterFraction(-Infinity)).toBe(0);
        expect(meterFraction(3)).toBe(1);
    });
});

describe("judgeLevel", () => {
    const at = (rmsDbfs: number) => ({ rmsDbfs, peakDbfs: rmsDbfs + 10 });

    test("names silence, a quiet voice and a good one", () => {
        expect(judgeLevel(at(-Infinity), -Infinity)).toBe("silent");
        expect(judgeLevel(at(-70), -60)).toBe("silent");
        expect(judgeLevel(at(-50), -40)).toBe("quiet");
        expect(judgeLevel(at(-20), -10)).toBe("good");
    });

    test("clipping wins over everything, judged on the held peak", () => {
        expect(judgeLevel(at(-50), CLIP_DBFS)).toBe("clipping");
        expect(judgeLevel(at(-20), 0)).toBe("clipping");
        expect(judgeLevel(at(-20), CLIP_DBFS - 0.01)).toBe("good");
    });
});
