"use client";

import { IconInfoCircle, IconPlayerPlay, IconPlayerStop, IconRefresh } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";
import type { SpeedRun } from "../types";
import { PlanCheck } from "./plan-check";
import { RunAnalysis } from "./run-analysis";
import { SpeedHistory } from "./speed-history";
import { useRateFormat } from "./use-rate-format";
import { useSpeedHistory } from "./use-speed-history";
import { useSpeedTest, type TestState } from "./use-speed-test";

type Meter = {
    readonly key: "download" | "upload" | "latency";
    readonly value: string;
    readonly unit: string;
    readonly detail: string | null;
    readonly active: boolean;
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
                    active: current.phase === "download",
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
                    active: current.phase === "upload",
                },
                {
                    key: "latency",
                    value: format.ms(live.latency),
                    unit: t("ms"),
                    detail:
                        live.jitter === undefined
                            ? null
                            : t("jitter", { value: format.ms(live.jitter) }),
                    active: current.phase === "latency",
                },
            ];
        }

        return [
            {
                key: "download",
                value: format.mbps(run?.downloadBps),
                unit: t("mbps"),
                detail: null,
                active: false,
            },
            {
                key: "upload",
                value: format.mbps(run?.uploadBps),
                unit: t("mbps"),
                detail: null,
                active: false,
            },
            {
                key: "latency",
                value: format.ms(run?.latencyMs),
                unit: t("ms"),
                detail:
                    run?.jitterMs == null ? null : t("jitter", { value: format.ms(run.jitterMs) }),
                active: false,
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
                {/* Above the button, not in the article: the test cannot keep
                    the site's "nothing leaves your device" promise, so the
                    reader is told before pressing, not after. */}
                <p className="bg-muted/50 ring-border/70 text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-xs leading-[1.5] ring-1 ring-inset">
                    <IconInfoCircle
                        className="mt-px size-4 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    {t("disclosure")}
                </p>

                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                        <StepLabel step={1}>{t("startLabel")}</StepLabel>
                        {running ? (
                            <Button type="button" variant="outline" onClick={cancel}>
                                <IconPlayerStop
                                    className="size-4"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {t("cancel")}
                            </Button>
                        ) : (
                            <Button type="button" onClick={start}>
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

                    <dl
                        className="grid gap-2 sm:grid-cols-3"
                        aria-live="polite"
                        aria-busy={running}
                    >
                        {meters.map((meter) => (
                            <div
                                key={meter.key}
                                className={cn(
                                    "bg-card flex min-w-0 flex-col gap-1 rounded-xl p-4 ring-1 transition-colors duration-200 ring-inset",
                                    meter.active ? "ring-primary/60" : "ring-border/70",
                                )}
                            >
                                <dt className="text-muted-foreground text-xs leading-[1.3] font-medium">
                                    {t(meter.key)}
                                </dt>
                                <dd className="flex items-baseline gap-1.5">
                                    <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
                                        {meter.value}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                        {meter.unit}
                                    </span>
                                </dd>
                                {meter.detail !== null && (
                                    <dd className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                                        {meter.detail}
                                    </dd>
                                )}
                            </div>
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
