import { SPEECH_FAILURE_REASONS, type SpeechFailureReason } from "../types";

/**
 * The route's response body: audio as it arrives, interleaved with progress,
 * ending in either `done` or the reason it stopped.
 *
 * Not a bare `audio/mpeg` stream, because a stream has to send its status code
 * before its first byte. Five thousand characters take over a minute to speak,
 * and the service can refuse the fourth of five pieces after three have already
 * gone out under a `200`. A bare stream would end there looking finished, and
 * the reader would download a file that stops mid-sentence. Framing gives the
 * failure somewhere to go after the headers have left.
 *
 * Each frame is `kind` (one byte), `length` (four bytes, big-endian), then
 * `length` bytes of payload:
 *
 * | kind | payload                                         |
 * | ---- | ----------------------------------------------- |
 * | 1    | MP3 bytes                                       |
 * | 2    | progress — `{ "step": n, "steps": total }` JSON |
 * | 3    | failure — `{ "reason": "…" }` JSON              |
 * | 4    | done — empty                                    |
 *
 * Only `done` means the audio is whole. A body that ends without it was cut off
 * — the platform's time limit, a dropped connection — and is reported as
 * `interrupted`, never as a finished file.
 */

const FRAME_KIND = { audio: 1, progress: 2, failure: 3, done: 4 } as const;

const HEADER_BYTES = 5;

/**
 * Far larger than any frame the route writes — the service sends audio in
 * kilobyte pieces, and the longest pause is a few hundred kilobytes — and small
 * enough that a corrupt length cannot make the reader allocate gigabytes.
 */
const MAX_FRAME_PAYLOAD = 4 * 1_024 * 1_024;

export type SpeechFrame =
    | { readonly kind: "audio"; readonly bytes: Uint8Array }
    | { readonly kind: "progress"; readonly step: number; readonly steps: number }
    | { readonly kind: "failure"; readonly reason: SpeechFailureReason }
    | { readonly kind: "done" };

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function frame(kind: number, payload: Uint8Array): Uint8Array {
    const bytes = new Uint8Array(HEADER_BYTES + payload.length);
    const view = new DataView(bytes.buffer);

    view.setUint8(0, kind);
    view.setUint32(1, payload.length);
    bytes.set(payload, HEADER_BYTES);

    return bytes;
}

export function encodeSpeechFrame(value: SpeechFrame): Uint8Array {
    switch (value.kind) {
        case "audio":
            return frame(FRAME_KIND.audio, value.bytes);
        case "progress":
            return frame(
                FRAME_KIND.progress,
                ENCODER.encode(JSON.stringify({ step: value.step, steps: value.steps })),
            );
        case "failure":
            return frame(
                FRAME_KIND.failure,
                ENCODER.encode(JSON.stringify({ reason: value.reason })),
            );
        case "done":
            return frame(FRAME_KIND.done, new Uint8Array(0));
    }
}

const FAILURE_REASONS: ReadonlySet<string> = new Set(SPEECH_FAILURE_REASONS);

function isFailureReason(value: unknown): value is SpeechFailureReason {
    return typeof value === "string" && FAILURE_REASONS.has(value);
}

function readJson(payload: Uint8Array): unknown {
    try {
        return JSON.parse(DECODER.decode(payload));
    } catch {
        return null;
    }
}

function decodePayload(kind: number, payload: Uint8Array): SpeechFrame | null {
    switch (kind) {
        case FRAME_KIND.audio:
            return { kind: "audio", bytes: payload };
        case FRAME_KIND.progress: {
            const value = readJson(payload);

            if (
                typeof value === "object" &&
                value !== null &&
                "step" in value &&
                "steps" in value &&
                Number.isInteger(value.step) &&
                Number.isInteger(value.steps)
            ) {
                return { kind: "progress", step: Number(value.step), steps: Number(value.steps) };
            }

            return null;
        }
        case FRAME_KIND.failure: {
            const value = readJson(payload);
            const reason =
                typeof value === "object" && value !== null && "reason" in value
                    ? value.reason
                    : null;

            // A reason this build does not know is still a failure — the
            // server is newer than the page. Reported as the generic one.
            return {
                kind: "failure",
                reason: isFailureReason(reason) ? reason : "upstream_unavailable",
            };
        }
        case FRAME_KIND.done:
            return { kind: "done" };
        default:
            return null;
    }
}

export type SpeechFrameReader = {
    /** Every complete frame the bytes so far finish, in order. */
    push(chunk: Uint8Array): SpeechFrame[] | null;
};

/**
 * An incremental reader, because a network chunk boundary falls wherever it
 * likes — mid-header as often as not. Returns `null` once the stream is
 * corrupt, and keeps returning it: a frame boundary lost once cannot be found
 * again, and guessing would play noise.
 */
export function createSpeechFrameReader(): SpeechFrameReader {
    let pending = new Uint8Array(0);
    let corrupt = false;

    return {
        push(chunk) {
            if (corrupt) {
                return null;
            }

            const joined = new Uint8Array(pending.length + chunk.length);

            joined.set(pending);
            joined.set(chunk, pending.length);

            const frames: SpeechFrame[] = [];
            let offset = 0;

            while (joined.length - offset >= HEADER_BYTES) {
                const view = new DataView(joined.buffer, joined.byteOffset + offset, HEADER_BYTES);
                const kind = view.getUint8(0);
                const length = view.getUint32(1);

                if (length > MAX_FRAME_PAYLOAD) {
                    corrupt = true;

                    return null;
                }

                if (joined.length - offset - HEADER_BYTES < length) {
                    break;
                }

                const start = offset + HEADER_BYTES;
                const decoded = decodePayload(kind, joined.slice(start, start + length));

                if (decoded === null) {
                    corrupt = true;

                    return null;
                }

                frames.push(decoded);
                offset = start + length;
            }

            pending = joined.slice(offset);

            return frames;
        },
    };
}
