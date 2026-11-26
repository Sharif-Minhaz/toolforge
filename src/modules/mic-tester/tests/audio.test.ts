import { describe, expect, test } from "bun:test";

import { buildAudioConstraints, DEFAULT_PROCESSING, readAudioSettings } from "../domain/audio";
import { parseProcessing } from "../validation/search-params";

describe("buildAudioConstraints", () => {
    test("the system default with every processing switch as asked", () => {
        expect(buildAudioConstraints(DEFAULT_PROCESSING, null)).toEqual({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        });
    });

    test("a chosen device is exact; processing stays a preference", () => {
        const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

        expect(buildAudioConstraints(raw, "abc")).toEqual({
            deviceId: { exact: "abc" },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        });
    });
});

describe("readAudioSettings", () => {
    test("reads what Chrome reports", () => {
        expect(
            readAudioSettings({
                sampleRate: 48_000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: false,
                autoGainControl: true,
            }),
        ).toEqual({
            sampleRate: 48_000,
            channelCount: 1,
            processing: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
        });
    });

    test("anything missing or nonsensical is not reported, never zero", () => {
        expect(readAudioSettings({ sampleRate: 0, channelCount: Number.NaN })).toEqual({
            sampleRate: null,
            channelCount: null,
            processing: { echoCancellation: null, noiseSuppression: null, autoGainControl: null },
        });
    });

    test("an echo-cancellation mode string means it is on", () => {
        expect(
            readAudioSettings({ echoCancellation: "remote-only" }).processing.echoCancellation,
        ).toBe(true);
    });
});

describe("parseProcessing", () => {
    test("no parameters is the browser default", () => {
        expect(parseProcessing({})).toEqual(DEFAULT_PROCESSING);
        expect(parseProcessing(undefined)).toEqual(DEFAULT_PROCESSING);
    });

    test("each switch is read on its own, and a bad value costs only itself", () => {
        expect(
            parseProcessing({ noiseSuppression: "off", autoGainControl: "sideways", extra: "x" }),
        ).toEqual({ echoCancellation: true, noiseSuppression: false, autoGainControl: true });
        expect(parseProcessing({ echoCancellation: ["off", "on"] })).toEqual(DEFAULT_PROCESSING);
    });
});
