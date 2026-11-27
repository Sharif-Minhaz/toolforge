"use client";

import { IconRefresh, IconTarget, IconTrophy } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/modules/tools/components/segmented-control";
import { savePersonalBest, usePersonalBests } from "@/modules/tools/components/use-personal-best";
import { useFitIntoView, useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StepLabel } from "@/modules/tools/components/workbench-step";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import {
    ARENA_CENTRE,
    createAimRun,
    describeBias,
    finishAim,
    isAimExpired,
    shootAim,
    startAim,
    summarizeAim,
} from "../domain/aim";
import { AIM_ARENA, AIM_TARGET_RADIUS } from "../domain/constants";
import {
    AIM_DURATIONS,
    AIM_SCENES,
    AIM_TARGET_SIZES,
    type AimScene,
    type AimDuration,
    type AimPoint,
    type AimRun,
    type AimTargetSize,
} from "../types";
import { AimSceneBackdrop } from "./aim-scene";
import { AimVillainTarget } from "./aim-villain";
import { GroupingPlot } from "./grouping-plot";

/** How often the clock redraws while a run is live. */
const TICK_MS = 100;

/** How many recent shots leave a mark on the arena. */
const MARKS_SHOWN = 6;

/** The start button's radius, in arena units: large enough to find at once. */
const START_RADIUS = 54;

const personalBestKey = (size: AimTargetSize, duration: AimDuration) => `aim:${size}:${duration}`;

type AimPanelProps = {
    initialSize: AimTargetSize;
    initialDuration: AimDuration;
    initialScene: AimScene;
    /** Whether this mode is the one showing; see the effect that reads it. */
    active?: boolean;
};

/** Where a pointer event landed, in arena units. */
function arenaPoint(event: PointerEvent<SVGSVGElement>): AimPoint {
    const box = event.currentTarget.getBoundingClientRect();

    return {
        x: ((event.clientX - box.left) / box.width) * AIM_ARENA.width,
        y: ((event.clientY - box.top) / box.height) * AIM_ARENA.height,
    };
}

export function AimPanel({
    initialSize,
    initialDuration,
    initialScene,
    active = false,
}: AimPanelProps) {
    const t = useTranslations("mouseTester.aim");
    const formatter = useFormatter();
    const bests = usePersonalBests();
    const sizeLabelId = useId();
    const durationLabelId = useId();
    const hintId = useId();

    const [size, setSize] = useState(initialSize);
    const [duration, setDuration] = useState(initialDuration);
    const [scene, setScene] = useState(initialScene);
    const [run, setRun] = useState<AimRun>(createAimRun);
    const [now, setNow] = useState<number | null>(null);
    /** Shot marks, newest last: where each click landed and whether it hit. */
    const [marks, setMarks] = useState<readonly (AimPoint & { id: number; hit: boolean })[]>([]);
    /** The best on record when this run started; see the typing test. */
    const [bestBefore, setBestBefore] = useState(0);
    const markId = useRef(0);

    const durationMs = duration * 1000;
    const bestKey = personalBestKey(size, duration);
    // The clock's end is derived from the last tick, not stored.
    const settled =
        now !== null && isAimExpired(run, now, durationMs) ? finishAim(run, now, durationMs) : run;
    const running = settled.startedAt !== null && settled.endedAt === null;
    const finished = settled.endedAt !== null;
    const { ref: resultRef, scrollToResult } = useResultScroll<HTMLElement>();
    const { ref: arenaRef, fitIntoView } = useFitIntoView();

    // Opening this mode from the switch above frames the arena on screen. Only
    // on the switch itself — never on load, where a shared link to this mode
    // should not yank the page — so the last state is held in a ref.
    const wasActive = useRef(active);

    useEffect(() => {
        if (active && !wasActive.current) {
            fitIntoView();
        }

        wasActive.current = active;
    }, [active, fitIntoView]);
    const summary = summarizeAim(settled);
    const finalHits = finished ? summary.hits : 0;
    const newBest = finished && finalHits > bestBefore;
    const best = bests[bestKey];

    useEffect(() => {
        if (!running) {
            return;
        }

        const timer = window.setInterval(() => setNow(performance.now()), TICK_MS);

        return () => window.clearInterval(timer);
    }, [running]);

    // Idempotent: the store keeps the higher value.
    useEffect(() => {
        if (finalHits > 0) {
            savePersonalBest(bestKey, finalHits);
        }
    }, [bestKey, finalHits]);

    // The result is drawn below the arena when the run ends — by the clock or
    // by the last press — which is below the fold on a laptop. Bring it up
    // once per finished run; the hook leaves it alone if it is already in view.
    useEffect(() => {
        if (finished) {
            scrollToResult();
        }
    }, [finished, scrollToResult]);

    const remainingMs =
        settled.startedAt === null
            ? durationMs
            : Math.max(
                  0,
                  durationMs - ((settled.endedAt ?? now ?? settled.startedAt) - settled.startedAt),
              );

    function reset() {
        setRun(createAimRun());
        setNow(null);
        setMarks([]);
        // From the result below, or a setting above: glide back to the arena
        // so the next Start is already on screen.
        fitIntoView();
    }

    function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
        // The primary button only: a right click is the context menu's, and the
        // button test on the other tab is where every button gets counted.
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        const at = performance.now();
        const point = arenaPoint(event);

        if (settled.startedAt === null) {
            if (Math.hypot(point.x - ARENA_CENTRE.x, point.y - ARENA_CENTRE.y) <= START_RADIUS) {
                setBestBefore(best ?? 0);
                setRun(startAim(AIM_TARGET_RADIUS[size], at, cryptoRandomBytes));
                setNow(at);
                // Instant, not smooth: the clock is already running, and a
                // glide would be timed as part of the first flick.
                fitIntoView("instant");
            }

            return;
        }

        if (finished) {
            return;
        }

        const next = shootAim(settled, point, at, durationMs, cryptoRandomBytes);
        const shot = next.shots.length > settled.shots.length ? next.shots.at(-1) : undefined;

        setRun(next);
        setNow(at);

        if (shot !== undefined) {
            markId.current += 1;
            const mark = { ...point, id: markId.current, hit: shot.hit };

            setMarks((current) => [...current, mark].slice(-MARKS_SHOWN));
        }
    }

    const whole = (value: number) => formatter.number(Math.round(value));
    const ms = (value: number | null) =>
        value === null ? "—" : t("ms", { value: formatter.number(Math.round(value)) });
    const percent = (value: number) =>
        formatter.number(value, { style: "percent", maximumFractionDigits: 0 });
    const bits = (value: number | null) =>
        value === null
            ? "—"
            : t("bitsPerSecond", {
                  value: formatter.number(value, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                  }),
              });

    const target = settled.target;

    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:flex-row lg:items-end">
                <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label id={sizeLabelId} className="text-muted-foreground text-xs">
                            {t("size")}
                        </Label>
                        <SegmentedControl
                            size="sm"
                            options={AIM_TARGET_SIZES.map((value) => ({
                                value,
                                label: t(`sizes.${value}`),
                            }))}
                            value={size}
                            labelId={sizeLabelId}
                            layoutId="aim-size-indicator"
                            onChange={(value) => {
                                setSize(value);
                                reset();
                            }}
                        />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label id={durationLabelId} className="text-muted-foreground text-xs">
                            {t("duration")}
                        </Label>
                        <SegmentedControl
                            size="sm"
                            options={AIM_DURATIONS.map((value) => ({
                                value: String(value),
                                label: t("seconds", { value: formatter.number(value) }),
                            }))}
                            value={String(duration)}
                            labelId={durationLabelId}
                            layoutId="aim-duration-indicator"
                            onChange={(value) => {
                                setDuration(
                                    AIM_DURATIONS.find((option) => String(option) === value) ??
                                        duration,
                                );
                                reset();
                            }}
                        />
                    </div>
                    {/* Scenery only: changing it mid-run keeps the run going. */}
                    <OptionSelect
                        label={t("scene")}
                        value={scene}
                        values={AIM_SCENES}
                        items={Object.fromEntries(
                            AIM_SCENES.map((value) => [value, t(`scenes.${value}`)]),
                        )}
                        onChange={setScene}
                    />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={reset}
                    disabled={settled.startedAt === null}
                >
                    <IconRefresh className="size-3.5" stroke={1.8} aria-hidden="true" />
                    {t("reset")}
                </Button>
            </div>

            <div className="flex flex-col gap-3 p-4 sm:p-5">
                <StepLabel step={1}>{t("stepShoot")}</StepLabel>

                {/* The scoreboard and the arena, fitted to the screen together
                    on Start: playing on half an arena is not a test. */}
                <div ref={arenaRef} className="flex flex-col gap-3">
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <Figure
                            label={t("timeLeft")}
                            value={t("seconds", {
                                value: formatter.number(Math.ceil(remainingMs / 1000)),
                            })}
                            emphasis={running}
                        />
                        <Figure label={t("hits")} value={whole(summary.hits)} />
                        <Figure
                            label={t("accuracy")}
                            value={settled.shots.length === 0 ? "—" : percent(summary.accuracy)}
                        />
                        <Figure label={t("medianTime")} value={ms(summary.medianTimeMs)} />
                        <Figure label={t("best")} value={best === undefined ? "—" : whole(best)} />
                    </dl>

                    {/* The arena. A fixed aspect ratio, so arena units map to the
                    box the same way at every width and a target is round. */}
                    <div className="bg-muted/20 ring-border/70 relative overflow-hidden rounded-2xl ring-1 ring-inset">
                        <svg
                            viewBox={`0 0 ${AIM_ARENA.width} ${AIM_ARENA.height}`}
                            role="application"
                            aria-label={t("arenaLabel")}
                            aria-describedby={hintId}
                            onPointerDown={handlePointerDown}
                            onContextMenu={(event) => event.preventDefault()}
                            className="block h-auto w-full cursor-crosshair touch-none select-none"
                        >
                            <AimSceneBackdrop scene={scene} />

                            {marks.map((mark) =>
                                mark.hit ? (
                                    <circle
                                        key={mark.id}
                                        cx={mark.x}
                                        cy={mark.y}
                                        r={4}
                                        className="fill-success animate-out fade-out fill-mode-forwards duration-700"
                                    />
                                ) : (
                                    <g
                                        key={mark.id}
                                        className="stroke-destructive animate-out fade-out fill-mode-forwards duration-700"
                                        strokeWidth={2.5}
                                        strokeLinecap="round"
                                    >
                                        <line
                                            x1={mark.x - 6}
                                            y1={mark.y - 6}
                                            x2={mark.x + 6}
                                            y2={mark.y + 6}
                                        />
                                        <line
                                            x1={mark.x - 6}
                                            y1={mark.y + 6}
                                            x2={mark.x + 6}
                                            y2={mark.y - 6}
                                        />
                                    </g>
                                ),
                            )}

                            {settled.startedAt === null && (
                                <g className="text-primary pointer-events-none">
                                    <circle
                                        cx={ARENA_CENTRE.x}
                                        cy={ARENA_CENTRE.y}
                                        r={START_RADIUS}
                                        className="fill-card/90 stroke-primary"
                                        strokeWidth={2.5}
                                    />
                                    <text
                                        x={ARENA_CENTRE.x}
                                        y={ARENA_CENTRE.y}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        className="fill-primary text-[17px] font-medium"
                                    >
                                        {t("start")}
                                    </text>
                                </g>
                            )}

                            {target !== null && (
                                // Keyed by id, so every new target replays the
                                // entrance rather than sliding from the last spot.
                                <g
                                    key={target.id}
                                    className="animate-in zoom-in-50 fade-in pointer-events-none duration-150"
                                    style={{ transformOrigin: `${target.x}px ${target.y}px` }}
                                >
                                    <AimVillainTarget target={target} />
                                </g>
                            )}
                        </svg>
                    </div>
                </div>

                <p id={hintId} className="text-muted-foreground text-[0.75rem] leading-5">
                    {t("hint")}
                </p>
            </div>

            {finished && (
                <section
                    ref={resultRef}
                    aria-label={t("result.title")}
                    className="border-border/70 flex flex-col gap-4 border-t p-4 sm:p-5"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-sm font-medium">{t("result.title")}</h3>
                        <div className="flex items-center gap-2">
                            {newBest && (
                                <span className="bg-success/12 text-success ring-success/30 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-medium ring-1 ring-inset">
                                    <IconTrophy
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("result.newBest")}
                                </span>
                            )}
                            <Button size="sm" onClick={reset}>
                                <IconTarget className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("again")}
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
                        <div className="flex flex-col gap-3">
                            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <Figure label={t("hits")} value={whole(summary.hits)} large />
                                <Figure
                                    label={t("accuracy")}
                                    value={percent(summary.accuracy)}
                                    large
                                />
                                <Figure
                                    label={t("result.throughput")}
                                    value={bits(summary.throughput)}
                                    large
                                />
                                <Figure label={t("medianTime")} value={ms(summary.medianTimeMs)} />
                                <Figure
                                    label={t("result.bestTime")}
                                    value={ms(summary.bestTimeMs)}
                                />
                                <Figure label={t("result.misses")} value={whole(summary.misses)} />
                            </dl>
                            <p className="text-muted-foreground text-[0.75rem] leading-5">
                                {t("result.throughputHint")}
                            </p>
                        </div>
                        <GroupingPlot
                            offsets={summary.offsets}
                            bias={summary.bias}
                            label={t("result.grouping")}
                            emptyLabel={t("result.groupingEmpty")}
                            description={
                                summary.bias === null || summary.spread === null
                                    ? t("result.groupingEmpty")
                                    : t("result.groupingSummary", {
                                          direction: t(`result.bias.${describeBias(summary.bias)}`),
                                          spread: percent(summary.spread),
                                      })
                            }
                        />
                    </div>
                </section>
            )}
        </Card>
    );
}

function Figure({
    label,
    value,
    emphasis = false,
    large = false,
}: {
    label: string;
    value: string;
    emphasis?: boolean;
    large?: boolean;
}) {
    return (
        <div className="ring-border/60 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5 ring-1 ring-inset">
            <dt className="text-muted-foreground truncate text-xs font-medium">{label}</dt>
            <dd
                className={cn(
                    "font-mono font-semibold tabular-nums",
                    large ? "text-2xl" : "text-lg",
                    emphasis && "text-primary",
                )}
            >
                {value}
            </dd>
        </div>
    );
}
