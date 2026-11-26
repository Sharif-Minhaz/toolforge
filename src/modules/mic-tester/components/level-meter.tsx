"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { ReadingTile } from "@/modules/tools/components/reading-tile";
import {
    addSamples,
    EMPTY_WINDOW,
    heldPeakDbfs,
    holdPeak,
    judgeLevel,
    meterFraction,
    READING_INTERVAL_MS,
    readLevel,
    type PeakHold,
} from "../domain/level";
import { SPECTRUM_TICKS_HZ, spectrumBands, spectrumPosition } from "../domain/spectrum";
import type { Level } from "../types";

/** 2048 samples: about 43 ms at 48 kHz, and 1024 spectrum bins of 23 Hz. */
const FFT_SIZE = 2048;

type Published = {
    /** The stream this reading came from, so a stopped one never shows a stale level. */
    readonly stream: MediaStream;
    readonly level: Level;
    readonly heldPeak: number;
};

type LevelMeterProps = {
    stream: MediaStream | null;
    /** What the spectrum box shows while there is no stream: idle, starting or a failure. */
    children: ReactNode;
};

function drawSpectrum(
    canvas: HTMLCanvasElement,
    drawing: CanvasRenderingContext2D,
    bands: readonly number[],
) {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    drawing.clearRect(0, 0, width, height);
    // The canvas's own `color` is a theme token, so the bars follow light and dark.
    drawing.fillStyle = getComputedStyle(canvas).color;
    const slot = width / bands.length;
    const gap = Math.min(2 * ratio, slot / 4);

    bands.forEach((band, index) => {
        const bar = Math.max(ratio, band * height);

        drawing.fillRect(index * slot + gap / 2, height - bar, slot - gap, bar);
    });
}

/**
 * The live spectrum, the level bar and its readouts, over one stream.
 *
 * The audio graph is built when a stream arrives and torn down — frame loop
 * cancelled, context closed — when it goes, so a stopped microphone holds
 * nothing open. The spectrum is drawn every frame straight onto the canvas;
 * the numbers are published ten times a second, which is as fast as they can
 * be read, and only this component re-renders for them.
 */
export function LevelMeter({ stream, children }: LevelMeterProps) {
    const t = useTranslations("micTester.workbench");
    const formatter = useFormatter();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [published, setPublished] = useState<Published | null>(null);
    const current = published?.stream === stream ? published : null;

    useEffect(() => {
        const canvas = canvasRef.current;
        const drawing = canvas?.getContext("2d") ?? null;

        if (stream === null || canvas === null || drawing === null) {
            return;
        }

        let audio: AudioContext;

        try {
            audio = new AudioContext();
        } catch (caught) {
            logEvent("error", "mic_tester.audio_context_failed", { error: describeError(caught) });

            return;
        }

        const source = audio.createMediaStreamSource(stream);
        const analyser = audio.createAnalyser();

        analyser.fftSize = FFT_SIZE;
        // Never connected to the speakers: the microphone played straight
        // back would loop into itself and howl.
        source.connect(analyser);
        // A context created after an await can start suspended.
        void audio.resume();

        const samples = new Float32Array(analyser.fftSize);
        const bins = new Float32Array(analyser.frequencyBinCount);
        let gathered = EMPTY_WINDOW;
        let hold: PeakHold | null = null;
        let publishedAt = -Infinity;
        let frame = 0;

        const tick = (now: number) => {
            analyser.getFloatTimeDomainData(samples);
            analyser.getFloatFrequencyData(bins);
            gathered = addSamples(gathered, samples);
            drawSpectrum(canvas, drawing, spectrumBands(bins, audio.sampleRate));

            if (now - publishedAt >= READING_INTERVAL_MS) {
                const level = readLevel(gathered);

                hold = holdPeak(hold, level.peakDbfs, now);
                setPublished({ stream, level, heldPeak: heldPeakDbfs(hold, now) });
                gathered = EMPTY_WINDOW;
                publishedAt = now;
            }

            frame = window.requestAnimationFrame(tick);
        };

        frame = window.requestAnimationFrame(tick);

        return () => {
            window.cancelAnimationFrame(frame);
            source.disconnect();
            void audio.close();
        };
    }, [stream]);

    const dbfs = (value: number) =>
        t("dbfsValue", {
            value: formatter.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        });
    const frequency = (hz: number) =>
        hz >= 1000
            ? t("kilohertz", { value: formatter.number(hz / 1000) })
            : t("hertz", { value: formatter.number(hz) });
    const verdict = current === null ? null : judgeLevel(current.level, current.heldPeak);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <div className="bg-muted/30 ring-border/60 relative h-40 overflow-hidden rounded-2xl ring-1 ring-inset sm:h-48">
                    <canvas
                        ref={canvasRef}
                        role="img"
                        aria-label={t("spectrumLabel")}
                        className={cn("text-primary size-full", stream === null && "hidden")}
                    />

                    {stream !== null ? (
                        <span className="bg-background/80 text-foreground ring-border absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ring-1 ring-inset">
                            <span
                                aria-hidden="true"
                                className="bg-destructive size-1.5 rounded-full"
                            />
                            {t("live")}
                        </span>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                            {children}
                        </div>
                    )}
                </div>

                <div
                    aria-hidden="true"
                    className="text-muted-foreground relative h-4 text-[0.6875rem]"
                >
                    {SPECTRUM_TICKS_HZ.map((hz) => (
                        <span
                            key={hz}
                            className="absolute -translate-x-1/2 tabular-nums"
                            style={{ left: `${spectrumPosition(hz) * 100}%` }}
                        >
                            {frequency(hz)}
                        </span>
                    ))}
                </div>
            </div>

            {/* The bar is a picture of the readouts below it, which carry the
                same figures as text. */}
            <div
                aria-hidden="true"
                className="bg-muted ring-border/60 relative h-3 overflow-hidden rounded-full ring-1 ring-inset"
            >
                <div
                    className={cn(
                        "absolute inset-y-0 left-0 w-full origin-left transition-transform duration-100 ease-linear motion-reduce:transition-none",
                        verdict === "clipping" ? "bg-destructive" : "bg-primary",
                    )}
                    style={{
                        transform: `scaleX(${current === null ? 0 : meterFraction(current.level.rmsDbfs)})`,
                    }}
                />
                {current !== null && (
                    <div
                        className="bg-foreground absolute inset-y-0 w-0.5"
                        style={{ left: `calc(${meterFraction(current.heldPeak) * 100}% - 1px)` }}
                    />
                )}
            </div>

            <dl className="grid grid-cols-2 gap-2">
                <ReadingTile
                    label={t("rms")}
                    value={current === null ? t("noReading") : dbfs(current.level.rmsDbfs)}
                />
                <ReadingTile
                    label={t("peak")}
                    value={current === null ? t("noReading") : dbfs(current.heldPeak)}
                />
            </dl>

            {/* Two lines reserved: the verdict changes several times a second
                while somebody speaks, and a one-line "Good level." swapping
                with a two-line warning would bounce everything below it. */}
            <p
                className={cn(
                    "min-h-12 text-[0.8125rem] leading-6",
                    verdict === "clipping"
                        ? "text-destructive font-medium"
                        : "text-muted-foreground",
                    verdict === "good" && "text-foreground font-medium",
                )}
            >
                {verdict === null ? t("meterHint") : t(`verdict.${verdict}`)}
            </p>
        </div>
    );
}
