import { MAX_PAUSE_SECONDS } from "./constants";

/**
 * The arithmetic of the one MP3 shape the service returns, and the silence
 * this tool writes between pieces of it.
 *
 * `audio-24khz-48kbitrate-mono-mp3` is MPEG-2 Layer III at 24 kHz, 48 kbps,
 * mono. At that rate a frame is `72 × 48000 / 24000` = **144 bytes exactly**,
 * so the padding bit is never set, every frame is the same size, and each one
 * holds 576 samples — **24 ms**. Measured on 2026-10-16: 151 frames, all 144
 * bytes, no ID3 tag, no Xing or Info header, and ffprobe agreeing to the
 * millisecond with `frames × 0.024`.
 *
 * That shape is what makes splicing safe. With no header frame claiming a
 * duration, the file's length *is* its duration, and a player computes it the
 * way a constant-bitrate file asks to be computed. Each response the service
 * sends begins with `main_data_begin = 0`, so no frame reaches back into the
 * bit reservoir of the piece before it, and pieces can be joined end to end.
 */

export const MP3_FRAME_BYTES = 144;

export const MP3_FRAME_SECONDS = 576 / 24_000;

export const MP3_BYTES_PER_SECOND = MP3_FRAME_BYTES / MP3_FRAME_SECONDS;

/**
 * One frame of silence, built rather than recorded.
 *
 * `FF F3 64 C4` is the service's own header, byte for byte: sync, MPEG-2,
 * Layer III, no CRC, bitrate index 6 (48 kbps), sample-rate index 1 (24 kHz),
 * single channel, original bit set. The nine bytes of side information after
 * it are zero, which says *no main data, `main_data_begin = 0`, gain zero* —
 * a granule every decoder renders as zero samples. The rest of the frame is the
 * empty main-data region. ffmpeg's `silencedetect` reads a run of these as
 * digital silence at -91 dB, which is its floor.
 */
export const SILENT_FRAME: Uint8Array = (() => {
    const frame = new Uint8Array(MP3_FRAME_BYTES);

    frame.set([0xff, 0xf3, 0x64, 0xc4]);

    return frame;
})();

/** Whole frames, rounded to the nearest — at 24 ms a frame, nobody hears the difference. */
export function silentFrameCount(seconds: number): number {
    const bounded = Math.min(Math.max(0, seconds), MAX_PAUSE_SECONDS);

    return Math.round(bounded / MP3_FRAME_SECONDS);
}

export function buildSilence(seconds: number): Uint8Array {
    const count = silentFrameCount(seconds);
    const silence = new Uint8Array(count * MP3_FRAME_BYTES);

    for (let index = 0; index < count; index += 1) {
        silence.set(SILENT_FRAME, index * MP3_FRAME_BYTES);
    }

    return silence;
}

/** Exact for this format: every byte is 1/6000 of a second. */
export function audioSecondsOf(bytes: number): number {
    return bytes / MP3_BYTES_PER_SECOND;
}
