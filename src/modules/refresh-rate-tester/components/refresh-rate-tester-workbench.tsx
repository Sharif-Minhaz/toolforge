"use client";

import { IconPlayerPause, IconPlayerPlay, IconRefresh } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StepLabel } from "@/modules/tools/components/workbench-step";
import {
    MEASUREMENT_WINDOW_MS,
    MOTION_SPEED_PX_PER_SECOND,
    POWER_SAVER_RATE,
} from "../domain/constants";
import { stepPerFrame } from "../domain/motion";
import { MOTION_SPEEDS, type MotionSpeed } from "../types";
import { ReadingTile } from "./reading-tile";
import { useFrameMeter } from "./use-frame-meter";
import { useMotionBlock } from "./use-motion-block";

type RefreshRateTesterWorkbenchProps = {
    initialSpeed: MotionSpeed;
};

export function RefreshRateTesterWorkbench({ initialSpeed }: RefreshRateTesterWorkbenchProps) {
    const t = useTranslations("refreshRateTester.workbench");
    const formatter = useFormatter();
    const { reading, restart } = useFrameMeter();
    const timingId = useId();

    const [speed, setSpeed] = useState(initialSpeed);
    // Paused until pressed: moving content that starts by itself is what a
    // reader with reduced motion switched on asked not to get.
    const [playing, setPlaying] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);
    const blockRef = useRef<HTMLDivElement>(null);
    const pxPerSecond = MOTION_SPEED_PX_PER_SECOND[speed];

    useMotionBlock(trackRef, blockRef, pxPerSecond, playing);

    const summary = reading.status === "ready" ? reading.summary : null;
    const seconds = formatter.number(MEASUREMENT_WINDOW_MS / 1000);
    const decimals = (value: number, digits: number) =>
        formatter.number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const ms = (value: number) => decimals(value, 2);

    function describeNearest(): string {
        switch (reading.status) {
            case "warming_up":
                return t("status.warmingUp");
            case "collecting":
                return t("status.collecting");
            case "ready":
                return reading.summary.nearestRate === null
                    ? t("nearestNone")
                    : t("nearest", { rate: formatter.number(reading.summary.nearestRate) });
        }
    }

    const speedItems = Object.fromEntries(
        MOTION_SPEEDS.map((value) => [
            value,
            t("speedOption", {
                name: t(`speeds.${value}`),
                px: formatter.number(MOTION_SPEED_PX_PER_SECOND[value]),
            }),
        ]),
    );

    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    <StepLabel step={1}>{t("rateLabel")}</StepLabel>

                    <div className="bg-muted/30 ring-border/60 flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center ring-1 ring-inset">
                        {/* Redrawn four times a second, so it is not a live
                            region; the nearest-rate line below is, and it
                            only changes when the answer does. */}
                        <span className="font-mono text-5xl font-semibold tabular-nums sm:text-6xl">
                            {summary === null
                                ? "—"
                                : t.rich("hzReading", {
                                      value: decimals(summary.hz, 1),
                                      unit: (chunks) => (
                                          <span className="text-muted-foreground text-2xl font-medium sm:text-3xl">
                                              {chunks}
                                          </span>
                                      ),
                                  })}
                        </span>
                        <span aria-live="polite" className="text-sm font-medium">
                            {describeNearest()}
                        </span>
                        <p className="text-muted-foreground max-w-sm text-[0.75rem] leading-5">
                            {summary?.nearestRate === POWER_SAVER_RATE
                                ? t("powerSaverHint", {
                                      rate: formatter.number(POWER_SAVER_RATE),
                                  })
                                : t("rateHint", { seconds })}
                        </p>
                    </div>
                </div>

                <section aria-labelledby={timingId} className="flex flex-col gap-3 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                        <h3 id={timingId} className="text-muted-foreground text-xs font-medium">
                            {t("timingTitle")}
                        </h3>
                        <Button variant="outline" size="sm" onClick={restart}>
                            <IconRefresh className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {t("restart")}
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <ReadingTile
                            label={t("frameTime")}
                            value={
                                summary === null
                                    ? "—"
                                    : t("ms", { value: ms(summary.medianIntervalMs) })
                            }
                            hint={t("frameTimeHint")}
                        />
                        <ReadingTile
                            label={t("jitter")}
                            value={
                                summary === null
                                    ? "—"
                                    : t("jitterValue", { value: ms(summary.jitterMs) })
                            }
                            hint={t("jitterHint")}
                        />
                        <ReadingTile
                            label={t("dropped")}
                            value={summary === null ? "—" : formatter.number(summary.droppedFrames)}
                            hint={t("droppedHint", { seconds })}
                        />
                        <ReadingTile
                            label={t("frames")}
                            value={summary === null ? "—" : formatter.number(summary.intervals + 1)}
                            hint={t("framesHint")}
                        />
                    </div>
                </section>
            </div>

            <div className="border-border/70 flex flex-col gap-3 border-t p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <StepLabel step={2}>{t("motionLabel")}</StepLabel>
                    <div className="flex items-end gap-2">
                        <div className="w-48">
                            <OptionSelect
                                label={t("speed")}
                                value={speed}
                                items={speedItems}
                                values={MOTION_SPEEDS}
                                onChange={setSpeed}
                            />
                        </div>
                        {/* The one filled button: starting the motion is the
                            only press the test needs. */}
                        <Button onClick={() => setPlaying((current) => !current)}>
                            {playing ? (
                                <IconPlayerPause
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            ) : (
                                <IconPlayerPlay
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            )}
                            {playing ? t("pause") : t("play")}
                        </Button>
                    </div>
                </div>

                {/* Decorative: the line under it says in words what the
                    motion shows. */}
                <div
                    ref={trackRef}
                    aria-hidden="true"
                    className="bg-muted/30 ring-border/60 relative h-28 overflow-hidden rounded-2xl ring-1 ring-inset"
                >
                    <div
                        ref={blockRef}
                        className="bg-primary absolute top-6 left-0 size-16 rounded-xl will-change-transform"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <span className="font-mono text-sm tabular-nums">
                        {summary === null
                            ? t("stepIdle")
                            : t("step", {
                                  px: decimals(stepPerFrame(pxPerSecond, summary.hz), 1),
                                  hz: formatter.number(Math.round(summary.hz)),
                              })}
                    </span>
                    <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                        {t("motionHint")}
                    </p>
                </div>
            </div>
        </Card>
    );
}
