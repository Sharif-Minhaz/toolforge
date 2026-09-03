import {
    BlobSource,
    BufferTarget,
    CanvasSink,
    Conversion,
    ConversionCanceledError,
    getFirstEncodableAudioCodec,
    Input,
    MATROSKA,
    MP4,
    Mp4OutputFormat,
    Output,
    QTFF,
    QUALITY_VERY_HIGH,
    WEBM,
    type InputFormat,
    type InputVideoTrack,
    type VideoSample,
} from "mediabunny";

import type {
    NormalizedBox,
    PixelBox,
    VideoCleanProgress,
    VideoCleanResult,
    VideoFailure,
    VideoFailureReason,
    VideoProbeResult,
    WatermarkProfile,
} from "../types";
import { browserCanvasFactory, type CanvasFactory } from "./canvas";
import { describeEngineError } from "./failure-detail";
import {
    addFrameSample,
    createFrameAccumulator,
    detectWatermark,
    filledProfile,
} from "./glyph-mask";
import { applyRepaint, planRepaint } from "./repaint-plan";
import {
    AUDIO_ENCODE_CODECS,
    DETECT_SAMPLE_COUNT,
    MAX_FAILURE_DETAIL_LENGTH,
    MAX_VIDEO_SECONDS,
    OUTPUT_KEY_FRAME_INTERVAL,
    OUTPUT_VIDEO_TYPE,
} from "./video-constants";
import { toPixelBox } from "./watermark-box";

/**
 * Containers the reader is allowed to hand over. Named one by one rather than
 * `ALL_FORMATS`, so the demuxers for the dozen formats nobody will bring here
 * never reach the bundle.
 */
const INPUT_FORMATS: InputFormat[] = [MP4, QTFF, MATROSKA, WEBM];

type ProgressReporter = (progress: VideoCleanProgress) => void;

export type CleanVideoOptions = {
    readonly file: File;
    /** The square the watermark is looked for in. */
    readonly box: NormalizedBox;
    /** Repaint the whole search box rather than only the mark found inside it. */
    readonly fillWholeBox: boolean;
    readonly signal?: AbortSignal;
    readonly onProgress?: ProgressReporter;
    /** Injected so the pipeline can be driven without a document. */
    readonly createCanvas?: CanvasFactory;
};

function failure(reason: VideoFailureReason, detail?: string): VideoFailure {
    return detail === undefined
        ? { ok: false, reason }
        : { ok: false, reason, detail: detail.slice(0, MAX_FAILURE_DETAIL_LENGTH) };
}

/** What the detector hands back: the mark's profile, or the name of why there is none. */
type FoundMark = { readonly ok: true; readonly profile: WatermarkProfile } | VideoFailure;

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/**
 * Where the detector looks, spread across the whole clip.
 *
 * Half-step offsets rather than `0` and `duration`: the first and last frames of
 * a generated clip are often a fade, and a fade to black tells the detector
 * nothing about what stays put in the corner.
 */
export function sampleTimestamps(duration: number, count: number): number[] {
    if (!(duration > 0) || count < 1) {
        return [0];
    }

    return Array.from({ length: count }, (_, index) => ((index + 0.5) / count) * duration);
}

function readingContext(
    createCanvas: CanvasFactory,
    width: number,
    height: number,
): CanvasRenderingContext2D | null {
    // `willReadFrequently` because every frame is read back out again: without
    // it the browser keeps the canvas on the GPU and each `getImageData` pays
    // for a round trip it did not have to.
    return createCanvas(width, height).getContext("2d", { willReadFrequently: true });
}

/**
 * Reads the container and reports what the clip is, without decoding a frame of
 * it. Everything the panel shows before the reader presses anything comes from
 * here, and so does the refusal for a clip that is too long to be worth starting.
 */
export async function probeVideo(file: File): Promise<VideoProbeResult> {
    if (file.size === 0) {
        return failure("empty_file");
    }

    const input = new Input({ formats: INPUT_FORMATS, source: new BlobSource(file) });

    try {
        if (!(await input.canRead())) {
            return failure("unreadable_container");
        }

        const track = await input.getPrimaryVideoTrack();

        if (track === null) {
            return failure("no_video_track");
        }

        if (!(await track.canDecode())) {
            return failure("undecodable");
        }

        const [width, height, durationSeconds, metrics] = await Promise.all([
            track.getDisplayWidth(),
            track.getDisplayHeight(),
            input.computeDuration(),
            track.computeFrameRateMetrics(),
        ]);

        if (!(durationSeconds > 0)) {
            return failure("unreadable_container");
        }

        if (durationSeconds > MAX_VIDEO_SECONDS) {
            return failure("too_long");
        }

        return {
            ok: true,
            facts: {
                name: file.name,
                type: file.type.toLowerCase(),
                bytes: file.size,
                width,
                height,
                durationSeconds,
                frameRate: metrics.bestGuessFrameRate,
            },
        };
    } catch (caught) {
        // Every throw a corrupt or half-written container can produce ends here.
        // The reader gets one sentence about the file rather than a demuxer's —
        // but the demuxer's own words ride along in `detail` for the log.
        return failure("unreadable_container", describeEngineError(caught));
    } finally {
        input.dispose();
    }
}

/**
 * Averages the corner across the clip and hands back the mark standing in it.
 *
 * Split out from the run so the detection can be described on its own: it is the
 * only part that looks at more than one frame at a time, and it is the part that
 * decides what the rest of the pass is allowed to touch.
 */
async function findMark(
    track: InputVideoTrack,
    searchBox: PixelBox,
    duration: number,
    createCanvas: CanvasFactory,
    fillWholeBox: boolean,
    signal: AbortSignal | undefined,
    report: ProgressReporter,
): Promise<FoundMark> {
    if (fillWholeBox) {
        return { ok: true, profile: filledProfile(searchBox.width, searchBox.height) };
    }

    const context = readingContext(createCanvas, searchBox.width, searchBox.height);

    if (context === null) {
        return failure("clean_failed", "detect: no 2d context");
    }

    const sink = new CanvasSink(track, { poolSize: 2 });
    const accumulator = createFrameAccumulator(searchBox.width, searchBox.height);
    const timestamps = sampleTimestamps(duration, DETECT_SAMPLE_COUNT);
    let seen = 0;

    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
        if (signal?.aborted === true) {
            return failure("canceled");
        }

        seen += 1;
        report({ stage: "detecting", ratio: clamp01(seen / timestamps.length) });

        if (wrapped === null) {
            continue;
        }

        context.drawImage(wrapped.canvas, -searchBox.x, -searchBox.y);
        addFrameSample(
            accumulator,
            context.getImageData(0, 0, searchBox.width, searchBox.height).data,
        );
    }

    const detection = detectWatermark(accumulator);

    return detection.ok ? { ok: true, profile: detection.profile } : failure("mark_not_found");
}

/**
 * Repaints one fixed rectangle out of every frame and writes the clip back.
 *
 * Nothing leaves the browser: the file is demuxed, decoded, painted and muxed
 * here, through the platform's own codecs. What comes back is a new MP4 — the
 * video track is necessarily re-encoded, because a codec cannot be asked to
 * change one corner of a frame without re-encoding it — while the audio track's
 * encoded samples are copied straight across.
 *
 * The muxing is driven by Mediabunny's own `Conversion` rather than by a
 * hand-written pump over two sinks. That was the first shape this took, and it
 * was wrong: a conversion already owns the things a pump has to get right and
 * silently does not — the offset a clip's first timestamp carries, an edit list,
 * rotation metadata, per-track backpressure, and copying an audio track through
 * without decoding it. The only part that is genuinely this tool's own is what
 * happens to each frame, and that is exactly what `process` is for.
 */
export async function cleanVideo(options: CleanVideoOptions): Promise<VideoCleanResult> {
    const { file, signal } = options;
    const createCanvas = options.createCanvas ?? browserCanvasFactory;
    const report: ProgressReporter = (progress) => options.onProgress?.(progress);
    const aborted = (): boolean => signal?.aborted === true;

    if (file.size === 0) {
        return failure("empty_file");
    }

    const input = new Input({ formats: INPUT_FORMATS, source: new BlobSource(file) });

    // Which step threw, carried out of the `catch` with the message. A single
    // `clean_failed` with no idea which of six stages produced it is a bug
    // report nobody can act on.
    let stage = "open";

    try {
        report({ stage: "reading", ratio: 0 });

        if (!(await input.canRead())) {
            return failure("unreadable_container");
        }

        stage = "probe";

        const track = await input.getPrimaryVideoTrack();

        if (track === null) {
            return failure("no_video_track");
        }

        if (!(await track.canDecode())) {
            return failure("undecodable");
        }

        const [width, height, duration] = await Promise.all([
            track.getDisplayWidth(),
            track.getDisplayHeight(),
            input.computeDuration(),
        ]);

        if (!(duration > 0)) {
            return failure("unreadable_container");
        }

        if (duration > MAX_VIDEO_SECONDS) {
            return failure("too_long");
        }

        report({ stage: "reading", ratio: 1 });
        stage = "detect";

        const searchBox = toPixelBox(options.box, { width, height });
        const found = await findMark(
            track,
            searchBox,
            duration,
            createCanvas,
            options.fillWholeBox,
            signal,
            report,
        );

        if (!found.ok) {
            return found;
        }

        const plan = planRepaint(found.profile, searchBox, { width, height });

        if (plan === null) {
            return failure("mark_not_found");
        }

        stage = "setup";

        const frame = createCanvas(width, height);
        const frameContext = frame.getContext("2d", { willReadFrequently: true });

        if (frameContext === null) {
            return failure("clean_failed", "setup: no 2d context");
        }

        const target = new BufferTarget();
        const output = new Output({
            format: new Mp4OutputFormat({ fastStart: "in-memory" }),
            target,
        });

        // Named rather than left to the muxer's own preference, which reached
        // for Opus — legal in an MP4 and unplayable in QuickTime and Safari.
        const audioTrack = await input.getPrimaryAudioTrack();
        const audioCodec =
            audioTrack === null
                ? null
                : await getFirstEncodableAudioCodec([...AUDIO_ENCODE_CODECS], {
                      numberOfChannels: await audioTrack.getNumberOfChannels(),
                      sampleRate: await audioTrack.getSampleRate(),
                  });

        const conversion = await Conversion.init({
            input,
            output,
            audio: audioCodec === null ? {} : { codec: audioCodec },
            video: {
                // Pinned to the canvas the frames are painted on, rather than
                // left to default.
                //
                // Without these the encoder takes its box from the input and the
                // painting takes its size from the track's display dimensions,
                // and the two agree right up until they do not — a clip carrying
                // rotation metadata, a pixel aspect ratio that is not 1:1, or a
                // resolution that changes part-way through. When they disagree
                // the frame is fitted into a box of the wrong shape, and a fit
                // that preserves aspect ratio pays for it in bars of black
                // baked into the picture. Stating both, with `fill`, means there
                // is one size in this pipeline and nothing left to letterbox.
                width,
                height,
                fit: "fill",
                // Painting a frame is a transcode by definition; saying so keeps
                // Mediabunny from trying to copy the encoded samples across.
                forceTranscode: true,
                // The top rung, not the sensible one. This tool hands somebody
                // their own footage back; a second pass through a lossy codec is
                // unavoidable, so the only question left is how little of it to
                // spend, and file size is nobody's problem when the file never
                // leaves the device.
                quality: QUALITY_VERY_HIGH,
                keyFrameInterval: OUTPUT_KEY_FRAME_INTERVAL,
                // Rotation is baked into the pixels rather than written as
                // metadata, because the box the reader drew is in the
                // orientation they were looking at.
                allowRotationMetadata: false,
                processedWidth: width,
                processedHeight: height,
                process: (sample: VideoSample) => {
                    // `draw` accounts for whatever rotation the sample still
                    // carries, so the canvas is always in display orientation —
                    // the one the search box was measured in.
                    sample.draw(frameContext, 0, 0, width, height);

                    const patch = frameContext.getImageData(
                        plan.work.x,
                        plan.work.y,
                        plan.work.width,
                        plan.work.height,
                    );

                    applyRepaint(patch.data, plan);
                    frameContext.putImageData(patch, plan.work.x, plan.work.y);

                    // The canvas, not a copy of it: Mediabunny reads it into a
                    // frame before this function is called again, so one canvas
                    // serves the whole clip.
                    return frame;
                },
            },
            showWarnings: false,
        });

        if (!conversion.isValid) {
            const reasons = conversion.discardedTracks
                .map((discarded) => discarded.reason)
                .join(", ");

            return failure(
                reasons.includes("no_encodable_target_codec") ? "no_encoder" : "clean_failed",
                `setup: discarded ${reasons || "everything"}`,
            );
        }

        // An audio track Mediabunny had to drop rather than carry. Said out
        // loud in the result rather than left for the reader to notice.
        const audioKept = !conversion.discardedTracks.some(
            (discarded) => discarded.track.type === "audio",
        );

        conversion.onProgress = (ratio) => report({ stage: "cleaning", ratio: clamp01(ratio) });

        const stopOnAbort = () => void conversion.cancel();

        signal?.addEventListener("abort", stopOnAbort, { once: true });
        stage = "convert";

        try {
            if (aborted()) {
                return failure("canceled");
            }

            await conversion.execute();
        } finally {
            signal?.removeEventListener("abort", stopOnAbort);
        }

        if (aborted()) {
            return failure("canceled");
        }

        stage = "finalize";
        report({ stage: "finalizing", ratio: 0 });

        const buffer = target.buffer;

        if (buffer === null) {
            return failure("clean_failed", "finalize: empty buffer");
        }

        report({ stage: "finalizing", ratio: 1 });

        return {
            ok: true,
            video: {
                blob: new Blob([buffer], { type: OUTPUT_VIDEO_TYPE }),
                width,
                height,
                durationSeconds: duration,
                repainted: plan.work,
                coverage: found.profile.coverage,
                audioKept,
                audioCodec,
            },
        };
    } catch (caught) {
        if (caught instanceof ConversionCanceledError || aborted()) {
            return failure("canceled");
        }

        return failure("clean_failed", `${stage}: ${describeEngineError(caught)}`);
    } finally {
        input.dispose();
    }
}
