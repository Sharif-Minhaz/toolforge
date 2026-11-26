"use client";

import { IconDeviceMobileOff, IconMaximize } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { StepLabel } from "@/modules/tools/components/workbench-step";

import {
    CHECKER_PREVIEW,
    DEFAULT_CUSTOM_COLOUR,
    IDLE_MS,
    patternBackground,
    stepPattern,
} from "../domain/patterns";
import { SCREEN_PATTERNS, type ScreenDisplay, type ScreenStep } from "../types";
import { TestScreen } from "./test-screen";

type Run = { readonly index: number; readonly display: ScreenDisplay };

const CUSTOM_INDEX = SCREEN_PATTERNS.indexOf("custom");

/** Key names are what is printed on the caps, so they are data, not copy. */
const LEGEND = [
    { keys: ["→", "↓", "Space"], action: "legendNext" },
    { keys: ["←", "↑"], action: "legendPrevious" },
    { keys: ["Esc"], action: "legendExit" },
] as const;

const subscribeNever = () => () => {};

/**
 * Whether the page may go full screen. iPhone Safari has no Fullscreen API,
 * and an iframe without permission reports `false`. The server assumes it
 * can, so a desktop never flashes the notice on hydration.
 */
function useFullscreenEnabled(): boolean {
    return useSyncExternalStore(
        subscribeNever,
        () => document.fullscreenEnabled === true,
        () => true,
    );
}

export function ScreenTesterWorkbench() {
    const t = useTranslations("screenTester.workbench");
    const tPatterns = useTranslations("screenTester.patterns");
    const fullscreenEnabled = useFullscreenEnabled();

    const patternsLabelId = useId();
    const colourId = useId();
    const colourHintId = useId();

    const [startIndex, setStartIndex] = useState(0);
    const [customColour, setCustomColour] = useState(DEFAULT_CUSTOM_COLOUR);
    const [run, setRun] = useState<Run | null>(null);

    // Leaving full screen the browser's way — Esc, or a system gesture —
    // ends the run as well.
    useEffect(() => {
        function handleChange() {
            if (document.fullscreenElement === null) {
                setRun((current) => (current?.display === "fullscreen" ? null : current));
            }
        }

        document.addEventListener("fullscreenchange", handleChange);

        return () => document.removeEventListener("fullscreenchange", handleChange);
    }, []);

    function start() {
        if (!fullscreenEnabled) {
            setRun({ index: startIndex, display: "unsupported" });

            return;
        }

        setRun({ index: startIndex, display: "fullscreen" });

        // Asked for here, inside the click, because full screen is granted
        // only to a user gesture — and for the whole document, because the
        // dialog's own element does not exist until React has committed.
        document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {
            setRun((current) => (current === null ? null : { ...current, display: "refused" }));
        });
    }

    function end() {
        if (document.fullscreenElement !== null) {
            document.exitFullscreen().catch((caught: unknown) => {
                logEvent("warn", "screen_tester.exit_fullscreen_failed", {
                    error: describeError(caught),
                });
            });
        }

        setRun(null);
    }

    function step(direction: ScreenStep) {
        setRun((current) =>
            current === null ? null : { ...current, index: stepPattern(current.index, direction) },
        );
    }

    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="flex flex-col gap-3 p-4 sm:p-5">
                {/* Above the choices: a phone reader learns before starting
                    that the browser bars will stay. */}
                {!fullscreenEnabled && (
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
                                {t("noFullscreen.title")}
                            </span>
                            <span className="text-muted-foreground text-[0.75rem] leading-5">
                                {t("noFullscreen.body")}
                            </span>
                        </div>
                    </div>
                )}

                <StepLabel step={1} id={patternsLabelId}>
                    {t("patternsLabel")}
                </StepLabel>

                <div
                    role="group"
                    aria-labelledby={patternsLabelId}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                    {SCREEN_PATTERNS.map((pattern, index) => {
                        const selected = index === startIndex;

                        return (
                            <button
                                key={pattern}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setStartIndex(index)}
                                className={cn(
                                    "flex min-w-0 flex-col gap-2 rounded-xl p-2 text-left ring-1 transition-colors duration-200 ring-inset",
                                    selected
                                        ? "bg-primary/8 ring-primary"
                                        : "ring-border/70 hover:bg-muted/50",
                                )}
                            >
                                {/* The swatch is the pattern itself, so it
                                    paints raw colours like the test does. */}
                                <span
                                    aria-hidden="true"
                                    className="ring-border/70 aspect-video w-full rounded-lg ring-1 ring-inset"
                                    style={{
                                        background:
                                            patternBackground(pattern, customColour) ??
                                            CHECKER_PREVIEW,
                                    }}
                                />
                                <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
                                    <span className="text-[0.8125rem] leading-[1.3] font-medium">
                                        {tPatterns(`${pattern}.name`)}
                                    </span>
                                    <span className="text-muted-foreground text-[0.6875rem] leading-normal">
                                        {tPatterns(`${pattern}.hint`)}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-start gap-3 pt-1">
                    <input
                        id={colourId}
                        type="color"
                        value={customColour}
                        aria-describedby={colourHintId}
                        onChange={(event) => {
                            setCustomColour(event.target.value);
                            setStartIndex(CUSTOM_INDEX);
                        }}
                        className={cn(
                            "ring-border/70 size-9 shrink-0 cursor-pointer rounded-lg bg-transparent ring-1 ring-inset",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                        )}
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <label
                            htmlFor={colourId}
                            className="text-[0.8125rem] leading-[1.3] font-medium"
                        >
                            {t("customColour")}{" "}
                            <span className="text-muted-foreground font-mono text-xs font-normal uppercase">
                                {customColour}
                            </span>
                        </label>
                        <p
                            id={colourHintId}
                            className="text-muted-foreground text-[0.6875rem] leading-normal"
                        >
                            {t("customColourHint")}
                        </p>
                    </div>
                </div>
            </div>

            <div className="border-border/70 flex flex-col gap-3 border-t p-4 sm:p-5">
                <StepLabel step={2}>{t("startLabel")}</StepLabel>

                <ul className="grid gap-2 text-[0.75rem] sm:grid-cols-2">
                    {LEGEND.map(({ keys, action }) => (
                        <li key={action} className="flex items-center gap-2">
                            <span className="flex shrink-0 gap-1">
                                {keys.map((key) => (
                                    <kbd
                                        key={key}
                                        className="bg-muted text-muted-foreground ring-border/70 rounded-[0.3rem] px-1.5 py-0.5 font-mono text-[0.6875rem] leading-[1.3] font-medium ring-1 ring-inset"
                                    >
                                        {key}
                                    </kbd>
                                ))}
                            </span>
                            <span>{t(action)}</span>
                        </li>
                    ))}
                    <li>{t("legendClick")}</li>
                </ul>
                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("legendIdle", { seconds: IDLE_MS / 1000 })}
                </p>

                {/* The one filled button: the test is the whole tool. */}
                <Button size="lg" className="self-start" onClick={start}>
                    <IconMaximize className="size-4" stroke={1.8} aria-hidden="true" />
                    {t("start")}
                </Button>
            </div>

            <Dialog
                open={run !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        end();
                    }
                }}
            >
                {run !== null && (
                    <TestScreen
                        index={run.index}
                        display={run.display}
                        customColour={customColour}
                        onStep={step}
                    />
                )}
            </Dialog>
        </Card>
    );
}
