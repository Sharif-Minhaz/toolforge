import { describe, expect, test } from "bun:test";

import {
    createSpeechFrameReader,
    encodeSpeechFrame,
    type SpeechFrame,
} from "@/modules/text-to-speech/domain/frames";
import {
    audioSecondsOf,
    buildSilence,
    MP3_FRAME_BYTES,
    SILENT_FRAME,
    silentFrameCount,
} from "@/modules/text-to-speech/domain/mp3";
import {
    clampProsody,
    formatProsodyValue,
    toProsodyStrings,
} from "@/modules/text-to-speech/domain/prosody";

describe("silence", () => {
    test("the frame header is the service's own, byte for byte", () => {
        // Read off a real response on 2026-10-16: MPEG-2 Layer III, 48 kbps,
        // 24 kHz, mono. A different header would splice a different stream.
        expect([...SILENT_FRAME.subarray(0, 4)]).toEqual([0xff, 0xf3, 0x64, 0xc4]);
        expect(SILENT_FRAME.length).toBe(144);
        expect(SILENT_FRAME.subarray(4).every((byte) => byte === 0)).toBe(true);
    });

    test("is whole frames, rounded to the nearest 24 ms", () => {
        expect(silentFrameCount(0.5)).toBe(21);
        expect(silentFrameCount(2)).toBe(83);
        expect(buildSilence(1).length).toBe(42 * MP3_FRAME_BYTES);
    });

    test("never exceeds the longest pause, nor goes negative", () => {
        expect(silentFrameCount(-1)).toBe(0);
        expect(silentFrameCount(1_000)).toBe(silentFrameCount(10));
    });

    test("duration is exact arithmetic at 6,000 bytes a second", () => {
        // 151 frames measured 3.624 s in ffprobe.
        expect(audioSecondsOf(151 * MP3_FRAME_BYTES)).toBeCloseTo(3.624, 6);
    });
});

describe("prosody", () => {
    test("always writes a sign and the unit", () => {
        expect(toProsodyStrings({ rate: 0, volume: -20, pitch: 15 })).toEqual({
            rate: "+0%",
            volume: "-20%",
            pitch: "+15Hz",
        });
    });

    test("clamps and rounds whatever arrives", () => {
        expect(clampProsody(80)).toBe(50);
        expect(clampProsody(-80)).toBe(-50);
        expect(clampProsody(12.6)).toBe(13);
        expect(clampProsody(Number.NaN)).toBe(0);
        expect(formatProsodyValue("pitch", -99)).toBe("-50Hz");
    });
});

describe("the response framing", () => {
    const frames: SpeechFrame[] = [
        { kind: "progress", step: 0, steps: 3 },
        { kind: "audio", bytes: new Uint8Array([1, 2, 3, 4, 5]) },
        { kind: "progress", step: 1, steps: 3 },
        { kind: "failure", reason: "upstream_refused" },
        { kind: "done" },
    ];

    const wire = (() => {
        const parts = frames.map(encodeSpeechFrame);
        const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
        let offset = 0;

        for (const part of parts) {
            out.set(part, offset);
            offset += part.length;
        }

        return out;
    })();

    test("round-trips in one read", () => {
        expect(createSpeechFrameReader().push(wire)).toEqual(frames);
    });

    test("round-trips however the network cuts the bytes", () => {
        for (const size of [1, 2, 3, 5, 7, 11]) {
            const reader = createSpeechFrameReader();
            const read: SpeechFrame[] = [];

            for (let offset = 0; offset < wire.length; offset += size) {
                read.push(...(reader.push(wire.subarray(offset, offset + size)) ?? []));
            }

            expect(read).toEqual(frames);
        }
    });

    test("a length nobody would send marks the stream corrupt, for good", () => {
        const reader = createSpeechFrameReader();

        expect(reader.push(new Uint8Array([1, 0xff, 0xff, 0xff, 0xff]))).toBeNull();
        expect(reader.push(encodeSpeechFrame({ kind: "done" }))).toBeNull();
    });

    test("an unknown frame kind is corrupt rather than skipped", () => {
        expect(createSpeechFrameReader().push(new Uint8Array([9, 0, 0, 0, 0]))).toBeNull();
    });

    test("a failure reason this build does not know still reads as a failure", () => {
        const payload = new TextEncoder().encode(JSON.stringify({ reason: "from_the_future" }));
        const bytes = new Uint8Array(5 + payload.length);

        bytes[0] = 3;
        new DataView(bytes.buffer).setUint32(1, payload.length);
        bytes.set(payload, 5);

        expect(createSpeechFrameReader().push(bytes)).toEqual([
            { kind: "failure", reason: "upstream_unavailable" },
        ]);
    });
});
