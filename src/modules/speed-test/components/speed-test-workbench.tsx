"use client";

import {
    IconActivity,
    IconArrowDown,
    IconArrowUp,
    IconPlayerPlay,
    IconPlayerStop,
    IconRefresh,
    type IconProps,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ComponentType, useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";
import { flowFor } from "../domain/signal";
import type { SpeedRun } from "../types";
import { LinkStage, type LinkTone } from "./link-stage";
import { LiveFigure } from "./live-figure";
import { PlanCheck } from "./plan-check";
import { RunAnalysis } from "./run-analysis";
import { RunTrace } from "./run-trace";
import { SpeedHistory } from "./speed-history";
import { useRateFormat } from "./use-rate-format";
import { useSpeedHistory } from "./use-speed-history";
import { type TestPhase, type TestState, useSpeedTest } from "./use-speed-test";

type MeterKey = "download" | "upload" | "latency";

/** `waiting` has no figure yet, `measuring` is the set running now. */
type MeterState = "waiting" | "measuring" | "measured";

type Meter = {
    readonly key: MeterKey;
    readonly value: string;
    readonly unit: string;
    readonly detail: string | null;
    readonly state: MeterState;
};

/** Each figure keeps one colour everywhere: the tile, the link and the trace. */
const METER_LOOK: Readonly<
    Record<MeterKey, { icon: ComponentType<IconProps>; text: string; ring: string; bar: string }>
> = {
    download: {
        icon: IconArrowDown,
        text: "text-primary",
        ring: "ring-primary/60",
        bar: "bg-primary",
    },
    upload: { icon: IconArrowUp, text: "text-chart-2", ring: "ring-chart-2/60", bar: "bg-chart-2" },
    latency: {
        icon: IconActivity,
        text: "text-foreground",
        ring: "ring-foreground/35",
        bar: "bg-foreground",
    },
};

export function SpeedTestWorkbench() {
    const t = useTranslations("speedTest.workbench");
    const tToast = useTranslations("speedTest.toast");
    const formatter = useFormatter();
    const format = useRateFormat();
    const history = useSpeedHistory();
    const { ref: resultRef, scrollToResult } = useResultScroll();

    const keep = history.keep;
    const handleFinished = useCallback(
        (run: SpeedRun) => {
            keep(run);
            scrollToResult();
        },
        [keep, scrollToResult],
    );
    const { state, start, cancel } = useSpeedTest(handleFinished);

    // The run on screen: the one just finished, else the newest kept one, so a
    // returning reader sees their last result without testing again.
    const shown: SpeedRun | null = state.status === "done" ? state.run : (history.runs[0] ?? null);
    const meters = metersFor(state, shown);
    const running = state.status === "running";
    const trace = state.status === "running" || state.status === "done" ? state.trace : null;
    const liveBps = state.status === "running" ? liveRate(state) : null;
    const flow = flowFor(running ? state.phase : null, liveBps);
    const tone: LinkTone = running ? state.phase : shown === null ? "idle" : "done";

    const status: { tone: StatusTone; message: string } =
        state.status === "running"
            ? { tone: "pending", message: t(`phases.${state.phase}`) }
            : state.status === "failed"
              ? { tone: "error", message: t("failed") }
              : shown === null
                ? { tone: "idle", message: t("statusIdle") }
                : {
                      tone: "success",
                      message: t("statusDone", {
                          time: formatter.dateTime(new Date(shown.at), {
                              dateStyle: "medium",
                              timeStyle: "short",
                          }),
                      }),
                  };

    function metersFor(current: TestState, run: SpeedRun | null): Meter[] {
        if (current.status === "running") {
            const live = current.live;
            const stateOf = (key: TestPhase, measured: boolean): MeterState =>
                current.phase === key ? "measuring" : measured ? "measured" : "waiting";

            return [
                {
                    key: "download",
                    value: format.mbps(
                        current.phase === "download"
                            ? (current.currentBps ?? live.download)
                            : live.download,
                    ),
                    unit: t("mbps"),
                    detail: null,
                    state: stateOf("download", live.download !== undefined),
                },
                {
                    key: "upload",
                    value: format.mbps(
                        current.phase === "upload"
                            ? (current.currentBps ?? live.upload)
                            : live.upload,
                    ),
                    unit: t("mbps"),
                    detail: null,
                    state: stateOf("upload", live.upload !== undefined),
                },
                {
                    key: "latency",
                    value: format.ms(live.latency),
                    unit: t("ms"),
                    detail:
                        live.jitter === undefined
                            ? null
                            : t("jitter", { value: format.ms(live.jitter) }),
                    state: stateOf("latency", live.latency !== undefined),
                },
            ];
        }

        const settled: MeterState = run === null ? "waiting" : "measured";

        return [
            {
                key: "download",
                value: format.mbps(run?.downloadBps),
                unit: t("mbps"),
                detail: null,
                state: settled,
            },
            {
                key: "upload",
                value: format.mbps(run?.uploadBps),
                unit: t("mbps"),
                detail: null,
                state: settled,
            },
            {
                key: "latency",
                value: format.ms(run?.latencyMs),
                unit: t("ms"),
                detail:
                    run?.jitterMs == null ? null : t("jitter", { value: format.ms(run.jitterMs) }),
                state: settled,
            },
        ];
    }

    function handleClear() {
        history.forget();
        toast.success(tToast("cleared"));
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={1}>{t("startLabel")}</StepLabel>
                    </div>

                    <div className="bg-muted/40 ring-border/70 flex flex-col gap-6 rounded-2xl p-4 ring-1 ring-inset sm:p-6">
                        <StageFigure state={state} shown={shown} liveBps={liveBps} />

                        <LinkStage flow={flow} tone={tone} />

                        <div className="flex justify-center">
                            {running ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="lg"
                                    className="min-w-36"
                                    onClick={cancel}
                                >
                                    <IconPlayerStop
                                        className="size-4"
                                        stroke={1.9}
                                        aria-hidden="true"
                                    />
                                    {t("cancel")}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    size="lg"
                                    className="min-w-36"
                                    onClick={start}
                                >
                                    {shown === null ? (
                                        <IconPlayerPlay
                                            className="size-4"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <IconRefresh
                                            className="size-4"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {shown === null ? t("start") : t("again")}
                                </Button>
                            )}
                        </div>

                        {trace !== null && <RunTrace trace={trace} />}
                    </div>

                    <dl
                        className="grid gap-2 sm:grid-cols-3"
                        aria-live="polite"
                        aria-busy={running}
                    >
                        {meters.map((meter) => (
                            <MeterTile key={meter.key} meter={meter} />
                        ))}
                    </dl>

                    <StatusStrip tone={status.tone} message={status.message} />
                </div>

                <div ref={resultRef} className={cn(RESULT_TRAY, "scroll-mt-24")}>
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={2}>{t("resultsLabel")}</StepLabel>
                    </div>
                    {shown !== null && <RunAnalysis run={shown} />}
                    <PlanCheck plan={history.plan} run={shown} onPlanChange={history.setPlan} />
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={3}>{t("historyLabel")}</StepLabel>
                    </div>
                    <SpeedHistory runs={history.runs} onClear={handleClear} />
                </div>
            </CardContent>
        </Card>
    );
}

/** The latest single request in the running direction, else that direction's figure so far. */
function liveRate(state: Extract<TestState, { status: "running" }>): number | null {
    if (state.phase === "latency") {
        return null;
    }

    return state.currentBps ?? state.live[state.phase] ?? null;
}

/**
 * The big number over the link: whatever is being measured right now, then
 * the download once the run is over. Keyed by unit, so moving from the round
 * trip to a rate counts up from zero instead of sliding from ms to Mbps.
 */
function StageFigure({
    state,
    shown,
    liveBps,
}: {
    state: TestState;
    shown: SpeedRun | null;
    liveBps: number | null;
}) {
    const t = useTranslations("speedTest.workbench");
    const format = useRateFormat();

    if (state.status === "running" && state.phase === "latency") {
        return (
            <LiveFigure
                key="ms"
                target={state.live.latency ?? state.trace.latency.at(-1) ?? null}
                format={format.ms}
                unit={t("ms")}
                caption={<FigureCaption meter="latency" label={t("latency")} />}
            />
        );
    }

    if (state.status === "running") {
        return (
            <LiveFigure
                key="mbps"
                target={liveBps}
                format={format.mbps}
                unit={t("mbps")}
                caption={<FigureCaption meter={state.phase} label={t(state.phase)} />}
            />
        );
    }

    return (
        <LiveFigure
            key="mbps"
            target={shown?.downloadBps ?? null}
            format={format.mbps}
            unit={t("mbps")}
            muted={shown === null}
            caption={
                shown === null ? (
                    t("figureIdle")
                ) : (
                    <FigureCaption meter="download" label={t("download")} />
                )
            }
        />
    );
}

function FigureCaption({ meter, label }: { meter: MeterKey; label: string }) {
    const look = METER_LOOK[meter];
    const Icon = look.icon;

    return (
        <>
            <Icon className={cn("size-3.5", look.text)} stroke={2.2} aria-hidden="true" />
            {label}
        </>
    );
}

function MeterTile({ meter }: { meter: Meter }) {
    const t = useTranslations("speedTest.workbench");
    const look = METER_LOOK[meter.key];
    const Icon = look.icon;
    const measuring = meter.state === "measuring";

    return (
        <div
            className={cn(
                "bg-card relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl p-4 ring-1 transition-colors duration-200 ring-inset",
                measuring ? look.ring : "ring-border/70",
            )}
        >
            <dt className="text-muted-foreground flex items-center gap-1.5 text-xs leading-[1.3] font-medium">
                <Icon className={cn("size-3.5", look.text)} stroke={2.2} aria-hidden="true" />
                {t(meter.key)}
                {measuring && <span className="sr-only">{t("tileMeasuring")}</span>}
            </dt>
            <dd className="flex items-baseline gap-1.5">
                <span
                    className={cn(
                        "font-mono text-3xl font-semibold tracking-tight tabular-nums transition-colors duration-200",
                        meter.state === "waiting" && "text-muted-foreground/70",
                    )}
                >
                    {meter.value}
                </span>
                <span className="text-muted-foreground text-xs">{meter.unit}</span>
            </dd>
            {meter.detail !== null && (
                <dd className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                    {meter.detail}
                </dd>
            )}
            {/* The set running now: an indeterminate bar, since the engine
                stops each set early once requests take long enough and so has
                no honest percentage to give. Still for reduced motion. */}
            {measuring && (
                <span
                    aria-hidden="true"
                    className="bg-border/60 absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
                >
                    <span
                        className={cn("motion-safe:animate-sweep block h-full w-1/3", look.bar)}
                    />
                </span>
            )}
        </div>
    );
}
