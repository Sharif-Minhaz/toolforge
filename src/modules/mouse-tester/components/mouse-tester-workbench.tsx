"use client";

import {
    IconDeviceMobileOff,
    IconDownload,
    IconHandFinger,
    IconRefresh,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    FAULT_WINDOW_STEP_MS,
    HOLD_TEST_MS,
    MAX_FAULT_WINDOW_MS,
    MIN_FAULT_WINDOW_MS,
} from "../domain/constants";
import { diagnose } from "../domain/diagnosis";
import { buildReport } from "../domain/report";
import { applyInput, createSession } from "../domain/session";
import { MOUSE_BUTTONS, type MouseInput } from "../types";
import { DiagnosisPanel } from "./diagnosis-panel";
import { EventLog } from "./event-log";
import { IntervalGauge } from "./interval-gauge";
import { MouseDiagram } from "./mouse-diagram";
import { StatTile } from "./stat-tile";
import { useMouseCapture } from "./use-mouse-capture";
import { useHasFinePointer } from "./use-pointer-capability";
import { useReportText } from "./use-report-text";

type MouseTesterWorkbenchProps = {
    initialFaultWindow: number;
};

export function MouseTesterWorkbench({ initialFaultWindow }: MouseTesterWorkbenchProps) {
    const t = useTranslations("mouseTester.workbench");
    const tButtons = useTranslations("mouseTester.buttons");
    const tToast = useTranslations("mouseTester.toast");
    const formatter = useFormatter();
    const reportText = useReportText();

    const zoneRef = useRef<HTMLDivElement>(null);
    const windowLabelId = useId();
    const zoneHintId = useId();

    const [session, setSession] = useState(createSession);
    const [faultWindowMs, setFaultWindowMs] = useState(initialFaultWindow);
    /** `performance.now()` while a button is held, for the live hold timer. */
    const [now, setNow] = useState<number | null>(null);

    const record = useCallback(
        (input: MouseInput) =>
            setSession((current) => applyInput(current, input, { faultWindowMs })),
        [faultWindowMs],
    );

    const capture = useMouseCapture(zoneRef, record);
    const hasFinePointer = useHasFinePointer();
    // Either signal is enough: a mouse that has moved on this page is a mouse,
    // whatever the media query thinks of a hybrid device.
    const noMouse = !hasFinePointer && !capture.sawMouse;
    const anyHeld = capture.held.size > 0;

    // A frame clock that only runs while something is held, so the hold timer
    // moves without a timer ticking for the whole life of the page.
    useEffect(() => {
        if (!anyHeld) {
            return;
        }

        let frame = window.requestAnimationFrame(function tick(time) {
            setNow(time);
            frame = window.requestAnimationFrame(tick);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [anyHeld]);

    const diagnosis = diagnose(session);
    const verdicts = {
        left: diagnosis.buttons.left.verdict,
        middle: diagnosis.buttons.middle.verdict,
        right: diagnosis.buttons.right.verdict,
        back: diagnosis.buttons.back.verdict,
        forward: diagnosis.buttons.forward.verdict,
    };

    const holding = MOUSE_BUTTONS.filter((button) => capture.held.has(button)).map((button) => ({
        button,
        ms: Math.max(0, (now ?? 0) - (session.buttons[button].lastDown ?? now ?? 0)),
    }))[0];

    // Live while a button is down; otherwise the last attempt, where it was
    // let go. Never the best attempt: a full bar after a short second try
    // would report a hold that did not happen.
    const holdMs = holding?.ms ?? session.lastHoldAttempt ?? 0;
    const holdProgress = Math.min(1, holdMs / HOLD_TEST_MS);

    function describeHold(): string {
        if (holding !== undefined) {
            return t("holding", {
                button: tButtons(holding.button),
                seconds: seconds(holding.ms),
                target: seconds(HOLD_TEST_MS),
            });
        }

        // A drop anywhere in the session is the finding, whatever came after.
        if (diagnosis.hold === "dropped" || session.lastHoldAttempt === null) {
            return t(`hold.${diagnosis.hold}`);
        }

        return session.lastHoldAttempt >= HOLD_TEST_MS
            ? t("holdLast.passed", { seconds: seconds(session.lastHoldAttempt) })
            : t("holdLast.short", {
                  seconds: seconds(session.lastHoldAttempt),
                  target: seconds(HOLD_TEST_MS),
              });
    }

    const chatter = MOUSE_BUTTONS.reduce((sum, button) => sum + session.buttons[button].chatter, 0);
    const drops = MOUSE_BUTTONS.reduce((sum, button) => sum + session.buttons[button].drops, 0);
    const lastInterval = session.log.find(
        (entry) => entry.kind === "press" && entry.interval !== null,
    );
    const latest = session.log[0];

    const seconds = (ms: number) =>
        formatter.number(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    function handleReset() {
        setSession(createSession());
        capture.resetPolling();
    }

    function handleDownload() {
        const generated = new Date();
        const content = buildReport(
            { diagnosis, faults: session.faults, polling: capture.polling },
            reportText({
                generated,
                userAgent: navigator.userAgent,
                faultWindowMs,
                durationMs: latest === undefined ? 0 : latest.at,
                truncated: session.faults.length < chatter + drops + session.wheel.reversals,
            }),
        );
        const filename = `mouse-test-${generated.toISOString().slice(0, 10)}.txt`;

        try {
            saveFile({ filename, mimeType: "text/plain;charset=utf-8", content });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "mouse_tester.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    function describeLatest(): string {
        if (latest === undefined) {
            return t("idle");
        }

        switch (latest.kind) {
            case "wheel":
                return t(`actions.${latest.control}`);
            case "press":
                return t("actions.press", { button: tButtons(latest.control) });
            case "release":
                return t("actions.release", {
                    button: tButtons(latest.control),
                    seconds: seconds(latest.hold),
                });
            case "key":
                return t("actions.key", { code: latest.code });
        }
    }

    const buttonTiles = MOUSE_BUTTONS.map((button) => ({
        button,
        stats: session.buttons[button],
    }));

    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                {/* The capture area. Everything a mouse does in here is
                    measured, and nothing it does leaves: no Back, no Forward,
                    no context menu, no autoscroll, no page scroll. */}
                <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    {/* Above the area, not in the article: a phone reader has
                        to learn before touching anything that nothing here
                        will count a finger. */}
                    {noMouse && (
                        <div
                            role="status"
                            className="bg-syntax-number/8 ring-syntax-number/30 flex items-start gap-2.5 rounded-xl p-3 ring-1 ring-inset"
                        >
                            <IconDeviceMobileOff
                                className="text-syntax-number mt-0.5 size-4 shrink-0"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-[0.8125rem] font-medium">
                                    {t("noMouse.title")}
                                </span>
                                <span className="text-muted-foreground text-[0.75rem] leading-5">
                                    {t("noMouse.body")}
                                </span>
                            </div>
                        </div>
                    )}

                    <div
                        ref={zoneRef}
                        role="application"
                        aria-label={t("zoneLabel")}
                        aria-describedby={zoneHintId}
                        className={cn(
                            "relative flex min-h-80 cursor-crosshair flex-col items-center justify-center gap-3 rounded-2xl p-4 select-none sm:min-h-96",
                            "bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_70%)]",
                            "border-2 border-dashed transition-colors duration-200",
                            capture.inside ? "border-primary/60" : "border-border",
                        )}
                    >
                        <span
                            className={cn(
                                "absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ring-1 ring-inset",
                                capture.inside
                                    ? "bg-primary/10 text-primary ring-primary/30"
                                    : "bg-muted text-muted-foreground ring-border",
                            )}
                        >
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "size-1.5 rounded-full",
                                    capture.inside ? "bg-primary" : "bg-muted-foreground/50",
                                )}
                            />
                            {capture.inside ? t("zoneActive") : t("zoneInactive")}
                        </span>

                        <MouseDiagram
                            held={capture.held}
                            flash={capture.flash}
                            verdicts={verdicts}
                            labels={{
                                left: tButtons("left"),
                                right: tButtons("right"),
                                back: tButtons("back"),
                                forward: tButtons("forward"),
                            }}
                        />

                        <p
                            id={zoneHintId}
                            className="text-muted-foreground max-w-xs text-center text-[0.75rem] leading-5"
                        >
                            {t("zoneHint")}
                        </p>
                    </div>

                    <div className="bg-muted/40 ring-border/60 flex flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 text-center ring-1 ring-inset">
                        <span className="text-muted-foreground text-[0.6875rem] font-medium tracking-wider uppercase">
                            {t("currentAction")}
                        </span>
                        <span aria-live="polite" className="text-base font-medium">
                            {describeLatest()}
                        </span>
                    </div>

                    {/* The hold test, which no click counter can run: a held
                        button that drops for a few milliseconds is what makes
                        a drag fall out of the hand halfway. */}
                    <div className="ring-border/60 flex flex-col gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                        <div className="flex items-center justify-between gap-2 text-[0.75rem]">
                            <span className="inline-flex items-center gap-1.5 font-medium">
                                <IconHandFinger
                                    className="text-primary size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("holdTitle")}
                            </span>
                            <span className="text-muted-foreground font-mono tabular-nums">
                                {describeHold()}
                            </span>
                        </div>
                        <div
                            role="progressbar"
                            aria-label={t("holdTitle")}
                            aria-valuemin={0}
                            aria-valuemax={HOLD_TEST_MS}
                            aria-valuenow={Math.round(holdProgress * HOLD_TEST_MS)}
                            className="bg-muted h-1.5 overflow-hidden rounded-full"
                        >
                            <div
                                className={cn(
                                    "h-full rounded-full",
                                    diagnosis.hold === "dropped"
                                        ? "bg-destructive"
                                        : holdProgress === 1
                                          ? "bg-success"
                                          : "bg-primary",
                                )}
                                style={{ width: `${holdProgress * 100}%` }}
                            />
                        </div>
                        <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                            {t("holdHint", { seconds: seconds(HOLD_TEST_MS) })}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-4 p-4 sm:p-5">
                    <section
                        aria-labelledby={`${zoneHintId}-buttons`}
                        className="flex flex-col gap-2"
                    >
                        <h3
                            id={`${zoneHintId}-buttons`}
                            className="text-muted-foreground text-[0.6875rem] font-medium tracking-wider uppercase"
                        >
                            {t("liveStatistics")}
                        </h3>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {buttonTiles.map(({ button, stats }) => (
                                <StatTile
                                    key={button}
                                    label={tButtons(button)}
                                    value={formatter.number(stats.presses)}
                                    active={capture.held.has(button)}
                                    alert={stats.chatter + stats.drops > 0}
                                />
                            ))}
                            <StatTile
                                label={t("scrollUpDown")}
                                value={`${formatter.number(session.wheel.counts.up)} / ${formatter.number(session.wheel.counts.down)}`}
                                active={capture.flash === "up" || capture.flash === "down"}
                                alert={session.wheel.reversals > 0}
                            />
                            <StatTile
                                label={t("tilt")}
                                value={`${formatter.number(session.wheel.counts.left)} / ${formatter.number(session.wheel.counts.right)}`}
                                active={capture.flash === "left" || capture.flash === "right"}
                            />
                            <StatTile
                                label={t("chatter")}
                                value={formatter.number(chatter)}
                                alert={chatter > 0}
                            />
                            <StatTile
                                label={t("drops")}
                                value={formatter.number(drops)}
                                alert={drops > 0}
                            />
                            <StatTile
                                label={t("reversals")}
                                value={formatter.number(session.wheel.reversals)}
                                alert={session.wheel.reversals > 0}
                            />
                            <StatTile
                                label={t("peakCps")}
                                value={formatter.number(session.peakCps)}
                            />
                            <StatTile
                                label={t("keys")}
                                value={formatter.number(session.keystrokes)}
                            />
                        </div>
                    </section>

                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="ring-border/60 flex flex-col gap-1 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                            <span className="text-muted-foreground text-[0.6875rem] font-medium tracking-wider uppercase">
                                {t("pollingRate")}
                            </span>
                            <span className="font-mono text-xl font-semibold tabular-nums">
                                {capture.polling === null
                                    ? "—"
                                    : t("hz", {
                                          value: formatter.number(
                                              Math.round(capture.polling.medianHz),
                                          ),
                                      })}
                            </span>
                            <span className="text-muted-foreground text-[0.6875rem] leading-normal">
                                {capture.polling === null
                                    ? t("pollingIdle")
                                    : capture.polling.rateClass === null
                                      ? t("pollingUnclassed")
                                      : t("pollingClass", {
                                            rate: formatter.number(capture.polling.rateClass),
                                        })}
                            </span>
                        </div>
                        <div className="ring-border/60 flex flex-col gap-1 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                            <span className="text-muted-foreground text-[0.6875rem] font-medium tracking-wider uppercase">
                                {t("pollingStability")}
                            </span>
                            <span className="font-mono text-xl font-semibold tabular-nums">
                                {capture.polling === null
                                    ? "—"
                                    : t("jitter", {
                                          value: formatter.number(
                                              Math.round(capture.polling.jitterPercent),
                                          ),
                                      })}
                            </span>
                            <span className="text-muted-foreground text-[0.6875rem] leading-normal">
                                {capture.peakPollingHz === null
                                    ? t("pollingPeakIdle")
                                    : t("pollingPeak", {
                                          value: formatter.number(
                                              Math.round(capture.peakPollingHz),
                                          ),
                                      })}
                            </span>
                        </div>
                    </div>

                    <IntervalGauge
                        interval={lastInterval?.kind === "press" ? lastInterval.interval : null}
                        faultWindowMs={faultWindowMs}
                    />

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <span id={windowLabelId} className="text-muted-foreground text-xs">
                                {t("faultWindow")}
                            </span>
                            <span className="font-mono text-xs tabular-nums">
                                {t("ms", { value: formatter.number(faultWindowMs) })}
                            </span>
                        </div>
                        <Slider
                            aria-labelledby={windowLabelId}
                            min={MIN_FAULT_WINDOW_MS}
                            max={MAX_FAULT_WINDOW_MS}
                            step={FAULT_WINDOW_STEP_MS}
                            value={faultWindowMs}
                            onValueChange={(value) =>
                                setFaultWindowMs(Array.isArray(value) ? value[0] : value)
                            }
                        />
                        <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                            {t("faultWindowHint")}
                        </p>
                    </div>
                </div>
            </div>

            <div className="border-border/70 grid gap-4 border-t p-4 sm:p-5 lg:grid-cols-2">
                <DiagnosisPanel diagnosis={diagnosis} />

                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">{t("eventLog")}</h3>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownload}
                                disabled={latest === undefined}
                            >
                                <IconDownload
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("downloadReport")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleReset}
                                disabled={latest === undefined}
                            >
                                <IconRefresh className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("reset")}
                            </Button>
                        </div>
                    </div>
                    <EventLog entries={session.log} />
                </div>
            </div>
        </Card>
    );
}
