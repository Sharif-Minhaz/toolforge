"use client";

import {
    IconCamera,
    IconCapture,
    IconLoader2,
    IconLock,
    IconPlayerStop,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { MediaDevicePicker } from "@/modules/tools/components/media-device-picker";
import { MediaFailureNotice } from "@/modules/tools/components/media-failure-notice";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { ReadingTile } from "@/modules/tools/components/reading-tile";
import { useMediaStream } from "@/modules/tools/components/use-media-stream";
import { StepLabel } from "@/modules/tools/components/workbench-step";
import { context2d, createCanvas, releaseCanvas, toPngBlob } from "@/modules/tools/domain/canvas";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { buildTimestampedFilename } from "@/modules/tools/domain/filenames";
import type { PixelSize } from "@/modules/tools/types";
import {
    buildVideoConstraints,
    judgeDelivery,
    PRESET_SIZES,
    readCapabilities,
    readVideoSettings,
} from "../domain/video";
import { RESOLUTION_PRESETS, type ResolutionPreset } from "../types";

type WebcamTesterWorkbenchProps = {
    initialPreset: ResolutionPreset;
    initialMirror: boolean;
};

export function WebcamTesterWorkbench({
    initialPreset,
    initialMirror,
}: WebcamTesterWorkbenchProps) {
    const t = useTranslations("webcamTester.workbench");
    const tCapabilities = useTranslations("webcamTester.capabilities");
    const tToast = useTranslations("webcamTester.toast");
    const formatter = useFormatter();

    const videoRef = useRef<HTMLVideoElement>(null);
    const camera = useMediaStream("video");
    const [preset, setPreset] = useState(initialPreset);
    const [mirror, setMirror] = useState(initialMirror);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    /** The frame the `<video>` is showing — a fallback for a browser whose settings leave size out. */
    const [frame, setFrame] = useState<PixelSize | null>(null);

    const { state, blocked } = camera;
    const live = state.status === "live" ? state : null;
    const stream = live?.stream ?? null;

    const failure = state.status === "failed" ? state.failure : blocked;

    // Only the element's source; no state is set here.
    useEffect(() => {
        if (videoRef.current !== null) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const settings = live?.track.getSettings() ?? null;
    const reading =
        settings === null
            ? null
            : readVideoSettings({
                  width: settings.width ?? frame?.width,
                  height: settings.height ?? frame?.height,
                  frameRate: settings.frameRate,
              });
    // Firefox has no `getCapabilities`, which is a fact to report, not a failure.
    const capabilities =
        live !== null && "getCapabilities" in live.track
            ? readCapabilities(live.track.getCapabilities())
            : null;
    const activeDeviceId = settings?.deviceId ?? deviceId;

    const digits = (value: number) => formatter.number(value, { useGrouping: false });
    const decimal = (value: number) =>
        formatter.number(value, { maximumFractionDigits: 2, useGrouping: false });
    const sizeText = (size: PixelSize) =>
        t("resolutionValue", { width: digits(size.width), height: digits(size.height) });

    const presetItems = Object.fromEntries(
        RESOLUTION_PRESETS.map((id) => [
            id,
            id === "max"
                ? t("largest")
                : t("presetName", {
                      name: PRESET_SIZES[id].name,
                      width: digits(PRESET_SIZES[id].size.width),
                      height: digits(PRESET_SIZES[id].size.height),
                  }),
        ]),
    );

    function open(nextPreset: ResolutionPreset, nextDeviceId: string | null) {
        // A pick that has since been unplugged falls back to the default
        // instead of failing with `overconstrained` on every retry.
        const listed = camera.devices.some((device) => device.id === nextDeviceId);

        setFrame(null);
        void camera.start(buildVideoConstraints(nextPreset, listed ? nextDeviceId : null));
    }

    function handleDeviceChange(next: string) {
        setDeviceId(next);
        open(preset, next);
    }

    function handlePresetChange(next: ResolutionPreset) {
        setPreset(next);

        // Idle, the size waits for Start; otherwise the same camera reopens at it.
        if (state.status !== "idle") {
            open(next, activeDeviceId);
        }
    }

    function handleFrame() {
        const video = videoRef.current;

        if (video !== null && video.videoWidth > 0) {
            setFrame({ width: video.videoWidth, height: video.videoHeight });
        }
    }

    async function handleSnapshot() {
        const video = videoRef.current;
        const canvas =
            video === null
                ? null
                : createCanvas({ width: video.videoWidth, height: video.videoHeight });
        const context = canvas === null ? null : context2d(canvas);

        try {
            if (video === null || canvas === null || context === null) {
                throw new Error("No frame to draw");
            }

            // Saved as the preview shows it, so what the reader framed is what they get.
            if (mirror) {
                context.translate(canvas.width, 0);
                context.scale(-1, 1);
            }

            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const blob = await toPngBlob(canvas);

            if (blob === null) {
                throw new Error("The canvas produced no PNG");
            }

            const filename = buildTimestampedFilename("webcam-snapshot", new Date(), "png");

            saveBlob({ filename, blob });
            toast.success(tToast("saved", { filename }));
        } catch (caught) {
            logEvent("error", "webcam_tester.snapshot_failed", { error: describeError(caught) });
            toast.error(tToast("failed"));
        } finally {
            releaseCanvas(canvas);
        }
    }

    const delivery =
        reading === null || reading.size === null
            ? null
            : {
                  verdict: judgeDelivery(preset, reading.size),
                  requested: preset === "max" ? "" : sizeText(PRESET_SIZES[preset].size),
                  delivered: sizeText(reading.size),
              };

    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="border-border/70 flex min-w-0 flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    <StepLabel step={1}>{t("previewLabel")}</StepLabel>

                    {/* Above the controls, not in the article: a reader deciding
                        whether to allow a camera is owed this first. */}
                    <p className="text-muted-foreground flex items-start gap-1.5 text-[0.75rem] leading-5">
                        <IconLock
                            className="mt-0.5 size-3.5 shrink-0 text-(--color-success)"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        {t("privacy")}
                    </p>

                    <div className="bg-muted/30 ring-border/60 relative aspect-video overflow-hidden rounded-2xl ring-1 ring-inset">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            aria-label={t("previewLabel")}
                            onLoadedMetadata={handleFrame}
                            onResize={handleFrame}
                            className={cn(
                                "size-full bg-black object-contain",
                                mirror && "-scale-x-100",
                                live === null && "hidden",
                            )}
                        />

                        {live !== null && (
                            <span className="bg-background/80 text-foreground ring-border absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ring-1 ring-inset">
                                <span
                                    aria-hidden="true"
                                    className="bg-destructive size-1.5 rounded-full"
                                />
                                {t("live")}
                            </span>
                        )}

                        {live === null && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                                {failure !== null ? (
                                    <MediaFailureNotice kind="video" failure={failure} />
                                ) : state.status === "starting" ? (
                                    <>
                                        <IconLoader2
                                            className="text-muted-foreground size-7 animate-spin"
                                            stroke={1.6}
                                            aria-hidden="true"
                                        />
                                        <p role="status" className="text-sm font-medium">
                                            {t("starting")}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <IconCamera
                                            className="text-muted-foreground size-8"
                                            stroke={1.5}
                                            aria-hidden="true"
                                        />
                                        <p className="text-muted-foreground max-w-xs text-[0.8125rem] leading-5">
                                            {t("idle")}
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {live !== null ? (
                            <>
                                {/* Live, the one filled button is the result the
                                    reader takes away. */}
                                <Button onClick={() => void handleSnapshot()}>
                                    <IconCapture
                                        className="size-4"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("snapshot")}
                                </Button>
                                <Button variant="outline" onClick={camera.stop}>
                                    <IconPlayerStop
                                        className="size-4"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("stop")}
                                </Button>
                            </>
                        ) : (
                            <Button
                                onClick={() => open(preset, deviceId)}
                                disabled={state.status === "starting" || blocked !== null}
                            >
                                <IconCamera className="size-4" stroke={1.8} aria-hidden="true" />
                                {t("start")}
                            </Button>
                        )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <MediaDevicePicker
                            kind="video"
                            devices={camera.devices}
                            value={activeDeviceId}
                            onChange={handleDeviceChange}
                        />
                        <OptionSelect
                            label={t("resolution")}
                            hint={t("resolutionHint")}
                            value={preset}
                            items={presetItems}
                            values={RESOLUTION_PRESETS}
                            onChange={handlePresetChange}
                        />
                    </div>

                    <OptionSwitch
                        label={t("mirror")}
                        hint={t("mirrorHint")}
                        checked={mirror}
                        onCheckedChange={setMirror}
                    />
                </div>

                <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
                    <StepLabel step={2}>{t("reportLabel")}</StepLabel>

                    {reading === null || live === null ? (
                        <p className="text-muted-foreground text-[0.8125rem] leading-6">
                            {t("reportEmpty")}
                        </p>
                    ) : (
                        <>
                            <dl className="grid grid-cols-3 gap-2">
                                <ReadingTile
                                    label={t("sizeTile")}
                                    value={
                                        reading.size === null
                                            ? t("notReported")
                                            : sizeText(reading.size)
                                    }
                                />
                                <ReadingTile
                                    label={t("frameRate")}
                                    value={
                                        reading.frameRate === null
                                            ? t("notReported")
                                            : t("frameRateValue", {
                                                  value: decimal(reading.frameRate),
                                              })
                                    }
                                />
                                <ReadingTile
                                    label={t("aspect")}
                                    value={
                                        reading.aspect === null
                                            ? t("notReported")
                                            : reading.aspect.approximate
                                              ? t("aspectApprox", { label: reading.aspect.label })
                                              : reading.aspect.label
                                    }
                                />
                            </dl>

                            {delivery !== null && (
                                <p className="text-muted-foreground text-[0.8125rem] leading-6">
                                    {t(`delivery.${delivery.verdict}`, {
                                        requested: delivery.requested,
                                        delivered: delivery.delivered,
                                    })}
                                </p>
                            )}

                            <dl className="ring-border/60 divide-border/60 flex flex-col divide-y rounded-xl text-[0.8125rem] ring-1 ring-inset">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                                    <dt className="text-muted-foreground">{t("device")}</dt>
                                    <dd className="min-w-0 font-medium wrap-break-word">
                                        {live.track.label === ""
                                            ? t("notReported")
                                            : live.track.label}
                                    </dd>
                                </div>
                            </dl>

                            <div className="flex flex-col gap-2">
                                <h3 className="text-sm font-medium">{t("capabilitiesTitle")}</h3>
                                {capabilities === null || capabilities.length === 0 ? (
                                    <p className="text-muted-foreground text-[0.8125rem] leading-6">
                                        {t("capabilitiesNone")}
                                    </p>
                                ) : (
                                    <dl className="ring-border/60 divide-border/60 flex flex-col divide-y rounded-xl text-[0.8125rem] ring-1 ring-inset">
                                        {capabilities.map((row) => (
                                            <div
                                                key={row.key}
                                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2"
                                            >
                                                <dt className="text-muted-foreground">
                                                    {tCapabilities(row.key)}
                                                </dt>
                                                <dd className="font-mono tabular-nums">
                                                    {row.kind === "range"
                                                        ? t("rangeValue", {
                                                              min: decimal(row.min),
                                                              max: decimal(row.max),
                                                          })
                                                        : row.values.join(", ")}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
}
