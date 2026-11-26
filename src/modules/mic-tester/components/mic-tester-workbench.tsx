"use client";

import {
    IconLoader2,
    IconLock,
    IconMicrophone,
    IconPlayerRecordFilled,
    IconPlayerStop,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MediaDevicePicker } from "@/modules/tools/components/media-device-picker";
import { MediaFailureNotice } from "@/modules/tools/components/media-failure-notice";
import { OptionSwitch } from "@/modules/tools/components/option-controls";
import { useMediaStream } from "@/modules/tools/components/use-media-stream";
import { StepLabel } from "@/modules/tools/components/workbench-step";
import { buildAudioConstraints, MAX_RECORDING_SECONDS, readAudioSettings } from "../domain/audio";
import { PROCESSING_OPTIONS, type Processing, type ProcessingOption } from "../types";
import { LevelMeter } from "./level-meter";
import { useClipRecorder } from "./use-clip-recorder";

type MicTesterWorkbenchProps = {
    initialProcessing: Processing;
};

export function MicTesterWorkbench({ initialProcessing }: MicTesterWorkbenchProps) {
    const t = useTranslations("micTester.workbench");
    const formatter = useFormatter();

    const microphone = useMediaStream("audio");
    const [processing, setProcessing] = useState(initialProcessing);
    const [deviceId, setDeviceId] = useState<string | null>(null);

    const { state, blocked } = microphone;
    const live = state.status === "live" ? state : null;
    const stream = live?.stream ?? null;
    const failure = state.status === "failed" ? state.failure : blocked;
    const recorder = useClipRecorder(stream);
    const { clip } = recorder;

    const settings = live?.track.getSettings() ?? null;
    const reading = settings === null ? null : readAudioSettings(settings);
    const activeDeviceId = settings?.deviceId ?? deviceId;

    function open(nextProcessing: Processing, nextDeviceId: string | null) {
        // A pick that has since been unplugged falls back to the default
        // instead of failing with `overconstrained` on every retry.
        const listed = microphone.devices.some((device) => device.id === nextDeviceId);

        void microphone.start(buildAudioConstraints(nextProcessing, listed ? nextDeviceId : null));
    }

    function handleDeviceChange(next: string) {
        setDeviceId(next);
        open(processing, next);
    }

    function handleProcessingChange(option: ProcessingOption, checked: boolean) {
        const next = { ...processing, [option]: checked };

        setProcessing(next);

        // Processing is fixed when the track opens, so a change reopens it;
        // idle, it waits for Start.
        if (state.status !== "idle") {
            open(next, activeDeviceId);
        }
    }

    const switchText = (on: boolean) => (on ? t("on") : t("off"));
    const appliedText = (option: ProcessingOption) => {
        const applied = reading?.processing[option] ?? null;

        if (applied === null) {
            return t("notReported");
        }

        return applied === processing[option]
            ? switchText(applied)
            : t("notApplied", {
                  applied: switchText(applied),
                  requested: switchText(processing[option]),
              });
    };

    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="border-border/70 flex min-w-0 flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    <StepLabel step={1}>{t("inputLabel")}</StepLabel>

                    {/* Above the controls, not in the article: a reader deciding
                        whether to allow a microphone is owed this first. */}
                    <p className="text-muted-foreground flex items-start gap-1.5 text-[0.75rem] leading-5">
                        <IconLock
                            className="mt-0.5 size-3.5 shrink-0 text-(--color-success)"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        {t("privacy")}
                    </p>

                    <LevelMeter stream={stream}>
                        {failure !== null ? (
                            <MediaFailureNotice kind="audio" failure={failure} />
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
                                <IconMicrophone
                                    className="text-muted-foreground size-8"
                                    stroke={1.5}
                                    aria-hidden="true"
                                />
                                <p className="text-muted-foreground max-w-xs text-[0.8125rem] leading-5">
                                    {t("idle")}
                                </p>
                            </>
                        )}
                    </LevelMeter>

                    <div className="flex flex-wrap items-center gap-2">
                        {live !== null ? (
                            <Button variant="outline" onClick={microphone.stop}>
                                <IconPlayerStop
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("stop")}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => open(processing, deviceId)}
                                disabled={state.status === "starting" || blocked !== null}
                            >
                                <IconMicrophone
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("start")}
                            </Button>
                        )}
                    </div>

                    <MediaDevicePicker
                        kind="audio"
                        devices={microphone.devices}
                        value={activeDeviceId}
                        onChange={handleDeviceChange}
                    />

                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-0.5">
                            <h3 className="text-sm font-medium">{t("processingTitle")}</h3>
                            <p className="text-muted-foreground text-[0.75rem] leading-5">
                                {t("processingHint")}
                            </p>
                        </div>
                        {PROCESSING_OPTIONS.map((option) => (
                            <OptionSwitch
                                key={option}
                                label={t(option)}
                                hint={t(`${option}Hint`)}
                                checked={processing[option]}
                                onCheckedChange={(checked) =>
                                    handleProcessingChange(option, checked)
                                }
                            />
                        ))}
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
                    <StepLabel step={2}>{t("recordLabel")}</StepLabel>

                    <div className="flex flex-col gap-3">
                        {clip.status === "recording" ? (
                            <>
                                {/* Live, the one filled button is the clip. */}
                                <Button className="self-start" onClick={recorder.stop}>
                                    <IconPlayerStop
                                        className="size-4"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("stopRecording")}
                                </Button>
                                <p className="flex items-center gap-2 text-[0.8125rem] leading-6 font-medium">
                                    <span
                                        aria-hidden="true"
                                        className="bg-destructive size-2 rounded-full"
                                    />
                                    {t("recording", {
                                        elapsed: clip.elapsed,
                                        limit: MAX_RECORDING_SECONDS,
                                    })}
                                </p>
                            </>
                        ) : (
                            <Button
                                className="self-start"
                                // One filled button at a time: Start until the
                                // microphone is live, then this.
                                variant={
                                    live === null || clip.status === "ready" ? "outline" : "default"
                                }
                                onClick={recorder.start}
                                disabled={live === null || recorder.unsupported}
                            >
                                <IconPlayerRecordFilled
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {clip.status === "ready" ? t("recordAgain") : t("record")}
                            </Button>
                        )}

                        {recorder.unsupported ? (
                            <p className="text-muted-foreground text-[0.8125rem] leading-6">
                                {t("recordUnsupported")}
                            </p>
                        ) : clip.status === "failed" ? (
                            <p role="alert" className="text-destructive text-[0.8125rem] leading-6">
                                {t("recordFailed")}
                            </p>
                        ) : clip.status === "ready" ? (
                            <div className="flex flex-col gap-2">
                                <audio
                                    controls
                                    src={clip.url}
                                    aria-label={t("clipLabel")}
                                    className="w-full"
                                />
                                <p className="text-muted-foreground text-[0.8125rem] leading-6">
                                    {t("clipReady", { seconds: clip.seconds })}
                                </p>
                            </div>
                        ) : clip.status === "idle" && live === null ? (
                            <p className="text-muted-foreground text-[0.8125rem] leading-6">
                                {t("recordEmpty", { seconds: MAX_RECORDING_SECONDS })}
                            </p>
                        ) : null}
                    </div>

                    <StepLabel step={3}>{t("reportLabel")}</StepLabel>

                    {live === null || reading === null ? (
                        <p className="text-muted-foreground text-[0.8125rem] leading-6">
                            {t("reportEmpty")}
                        </p>
                    ) : (
                        <dl className="ring-border/60 divide-border/60 flex flex-col divide-y rounded-xl text-[0.8125rem] ring-1 ring-inset">
                            <ReportRow
                                label={t("device")}
                                value={
                                    live.track.label === "" ? t("notReported") : live.track.label
                                }
                            />
                            <ReportRow
                                label={t("sampleRate")}
                                value={
                                    reading.sampleRate === null
                                        ? t("notReported")
                                        : t("sampleRateValue", {
                                              value: formatter.number(reading.sampleRate),
                                          })
                                }
                            />
                            <ReportRow
                                label={t("channels")}
                                value={
                                    reading.channelCount === null
                                        ? t("notReported")
                                        : t("channelsValue", { count: reading.channelCount })
                                }
                            />
                            {PROCESSING_OPTIONS.map((option) => (
                                <ReportRow
                                    key={option}
                                    label={t(option)}
                                    value={appliedText(option)}
                                />
                            ))}
                        </dl>
                    )}
                </div>
            </div>
        </Card>
    );
}

function ReportRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 font-medium wrap-break-word">{value}</dd>
        </div>
    );
}
