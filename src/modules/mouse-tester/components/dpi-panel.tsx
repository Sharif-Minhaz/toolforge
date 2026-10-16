"use client";

import { IconPlayerPlay, IconPlus, IconRuler2, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import {
    DEFAULT_DPI_DISTANCE,
    DEFAULT_DPI_UNIT,
    DPI_DISTANCE_RANGE,
    DPI_SPREAD_WARNING,
    DPI_UNITS,
    measureDpi,
    type DpiFailureReason,
    type DpiReading,
    type DpiStage,
    type DpiUnit,
} from "../domain/dpi";
import { dpiDistanceSchema } from "../validation/settings";
import { useSupportsPointerLock } from "./use-pointer-capability";

/**
 * The DPI test: a swipe of known length with the pointer locked.
 *
 * Locked so that the cursor hitting the edge of the screen cannot cut a swipe
 * short, and so `movementX` and `movementY` keep arriving however far the hand
 * travels. Chrome and Edge can lock with `unadjustedMovement`, which reports
 * the sensor's own counts before the operating system's acceleration curve;
 * anywhere else the counts are accelerated, and the panel says so rather than
 * presenting a wrong number as a measurement.
 */

/** Longer than any distance field needs; a short identity field, so it is capped. */
const MAX_DISTANCE_LENGTH = 5;

type LockFailure = "lock_failed";

type DpiPanelProps = {
    readings: readonly DpiReading[];
    stages: readonly DpiStage[];
    onReading: (reading: DpiReading) => void;
    onClear: () => void;
};

export function DpiPanel({ readings, stages, onReading, onClear }: DpiPanelProps) {
    const t = useTranslations("mouseTester.dpi");
    const formatter = useFormatter();
    const supported = useSupportsPointerLock();

    const padRef = useRef<HTMLDivElement>(null);
    const distanceId = useId();
    const distanceHintId = useId();
    const titleId = useId();

    const [unit, setUnit] = useState<DpiUnit>(DEFAULT_DPI_UNIT);
    const [distanceText, setDistanceText] = useState(
        String(DEFAULT_DPI_DISTANCE[DEFAULT_DPI_UNIT]),
    );
    const [stage, setStage] = useState(1);
    const [locked, setLocked] = useState(false);
    const [measuring, setMeasuring] = useState(false);
    const [counts, setCounts] = useState({ x: 0, y: 0 });
    /** Whether the last lock delivered raw counts; unknown until one has been taken. */
    const [raw, setRaw] = useState<boolean | null>(null);
    const [failure, setFailure] = useState<DpiFailureReason | LockFailure | null>(null);

    const parsedDistance = dpiDistanceSchema(unit).safeParse(distanceText);
    const distance = parsedDistance.success ? parsedDistance.data : null;
    const stageHasReading = readings.some((reading) => reading.stage === stage);

    useEffect(() => {
        function handleChange() {
            const isLocked =
                padRef.current !== null && document.pointerLockElement === padRef.current;

            setLocked(isLocked);

            if (!isLocked) {
                setMeasuring(false);
            }
        }

        function handleError() {
            setFailure("lock_failed");
        }

        document.addEventListener("pointerlockchange", handleChange);
        document.addEventListener("pointerlockerror", handleError);

        return () => {
            document.removeEventListener("pointerlockchange", handleChange);
            document.removeEventListener("pointerlockerror", handleError);
        };
    }, []);

    // Listens only while the pointer is locked. Nothing it reads can change
    // during a swipe — the pointer is captured, so no field can be reached.
    useEffect(() => {
        if (!locked || distance === null) {
            return;
        }

        let active = false;
        let x = 0;
        let y = 0;
        let frame = 0;

        function flush() {
            frame = 0;
            setCounts({ x, y });
        }

        function handleMove(event: MouseEvent) {
            if (!active) {
                return;
            }

            x += event.movementX;
            y += event.movementY;

            // One state update per frame, however fast a high-rate mouse reports.
            if (frame === 0) {
                frame = window.requestAnimationFrame(flush);
            }
        }

        function toggle() {
            if (!active) {
                active = true;
                x = 0;
                y = 0;
                setCounts({ x: 0, y: 0 });
                setMeasuring(true);

                return;
            }

            active = false;

            const result = measureDpi(x, y, distance ?? 0, unit);

            if (result.ok) {
                onReading({ stage, dpi: result.dpi });
            } else {
                setFailure(result.reason);
            }

            document.exitPointerLock();
        }

        function handleDown(event: MouseEvent) {
            if (event.button === 0) {
                event.preventDefault();
                toggle();
            }
        }

        function handleKey(event: KeyboardEvent) {
            if (event.code === "Space" || event.code === "Enter") {
                event.preventDefault();
                toggle();
            }
        }

        document.addEventListener("mousemove", handleMove);
        document.addEventListener("mousedown", handleDown);
        document.addEventListener("keydown", handleKey);

        return () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mousedown", handleDown);
            document.removeEventListener("keydown", handleKey);
            window.cancelAnimationFrame(frame);
        };
    }, [locked, distance, unit, stage, onReading]);

    async function startSwipe() {
        const pad = padRef.current;

        if (pad === null || distance === null) {
            return;
        }

        setFailure(null);
        setCounts({ x: 0, y: 0 });

        // Firefox returns nothing rather than a promise, and ignores the option:
        // its counts are the accelerated ones.
        try {
            const request: Promise<void> | undefined = pad.requestPointerLock({
                unadjustedMovement: true,
            });

            await request;
            // Only Chromium honours the option, and only Chromium exposes
            // `userAgentData`; a browser that resolves while ignoring the
            // option must not be credited with raw counts.
            setRaw(request !== undefined && "userAgentData" in navigator);

            return;
        } catch {
            // Refused the raw option — Safari, or Chrome on Linux. Ask again
            // without it below.
        }

        try {
            await pad.requestPointerLock();
            setRaw(false);
        } catch (caught) {
            logEvent("warn", "mouse_tester.pointer_lock_failed", { error: describeError(caught) });
            setFailure("lock_failed");
        }
    }

    function changeUnit(next: DpiUnit) {
        setUnit(next);
        setDistanceText(String(DEFAULT_DPI_DISTANCE[next]));
    }

    function clear() {
        setStage(1);
        setFailure(null);
        onClear();
    }

    const unitLabel = t(`units.${unit}`);
    const range = DPI_DISTANCE_RANGE[unit];

    function percent(value: number) {
        return formatter.number(value, { style: "percent", maximumFractionDigits: 1 });
    }

    function describeFailure(reason: DpiFailureReason | LockFailure): string {
        switch (reason) {
            case "too_short":
                return t("errors.tooShort");
            case "invalid_distance":
                return t("errors.invalidDistance");
            case "lock_failed":
                return t("errors.lockFailed");
        }
    }

    const padMessage = !locked
        ? t("padIdle")
        : measuring
          ? t("padMeasuring", { distance: formatter.number(distance ?? 0), unit: unitLabel })
          : t("padArmed");

    return (
        <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-1">
                <h3 id={titleId} className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <IconRuler2 className="text-primary size-4" stroke={1.8} aria-hidden="true" />
                    {t("title")}
                </h3>
                <p className="text-muted-foreground max-w-[68ch] text-[0.75rem] leading-5">
                    {t("intro")}
                </p>
            </div>

            {!supported ? (
                <StatusStrip tone="warning" message={t("unsupported")} />
            ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <Label
                                    htmlFor={distanceId}
                                    className="text-muted-foreground text-xs"
                                >
                                    {t("distance")}
                                </Label>
                                <Input
                                    id={distanceId}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    maxLength={MAX_DISTANCE_LENGTH}
                                    value={distanceText}
                                    aria-invalid={distance === null}
                                    aria-describedby={distanceHintId}
                                    disabled={locked}
                                    onChange={(event) => setDistanceText(event.target.value)}
                                    className="h-8 font-mono"
                                />
                            </div>
                            <OptionSelect
                                label={t("unit")}
                                value={unit}
                                values={DPI_UNITS}
                                items={{ cm: t("units.cm"), in: t("units.in") }}
                                disabled={locked}
                                onChange={changeUnit}
                            />
                        </div>
                        <p
                            id={distanceHintId}
                            className={cn(
                                "text-[0.6875rem] leading-normal",
                                distance === null ? "text-destructive" : "text-muted-foreground",
                            )}
                        >
                            {distance === null
                                ? t("errors.invalidDistance")
                                : t("distanceHint", {
                                      min: formatter.number(range.min),
                                      max: formatter.number(range.max),
                                      unit: unitLabel,
                                  })}
                        </p>

                        {/* The lock target. Clicking inside it while locked
                            starts and ends a swipe; it never counts as a press
                            in the capture area, which is a separate element. */}
                        <div
                            ref={padRef}
                            className={cn(
                                "flex min-h-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center",
                                locked
                                    ? "border-primary/60 bg-primary/5"
                                    : "border-border bg-muted/30",
                            )}
                        >
                            <span className="font-mono text-2xl font-semibold tabular-nums">
                                {t("counts", {
                                    value: formatter.number(
                                        Math.round(Math.hypot(counts.x, counts.y)),
                                    ),
                                })}
                            </span>
                            <span
                                aria-live="polite"
                                className="text-muted-foreground text-[0.75rem] leading-5"
                            >
                                {padMessage}
                            </span>
                            {locked && (
                                <span className="text-muted-foreground/80 text-[0.6875rem]">
                                    {t("escHint")}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                                size="sm"
                                onClick={() => void startSwipe()}
                                disabled={locked || distance === null}
                            >
                                <IconPlayerPlay
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("start", { stage: formatter.number(stage) })}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStage(stage + 1)}
                                disabled={locked || !stageHasReading}
                            >
                                <IconPlus className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("nextStage")}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clear}
                                disabled={locked || readings.length === 0}
                            >
                                <IconTrash className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("clear")}
                            </Button>
                        </div>

                        {failure !== null && (
                            <StatusStrip tone="error" message={describeFailure(failure)} />
                        )}
                        {raw === null ? (
                            <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                                {t("browserHint")}
                            </p>
                        ) : (
                            <StatusStrip
                                tone={raw ? "success" : "warning"}
                                message={raw ? t("rawYes") : t("rawNo")}
                            />
                        )}
                    </div>

                    <div className="flex min-w-0 flex-col gap-2">
                        {stages.length === 0 ? (
                            <p className="bg-muted/30 ring-border/60 text-muted-foreground grid min-h-32 place-items-center rounded-xl p-4 text-center text-[0.8125rem] ring-1 ring-inset">
                                {t("empty")}
                            </p>
                        ) : (
                            <div className="ring-border/70 overflow-x-auto rounded-xl ring-1 ring-inset">
                                <table className="w-full border-collapse text-left text-[0.8125rem]">
                                    <caption className="sr-only">{t("caption")}</caption>
                                    <thead>
                                        <tr className="bg-muted/50 text-muted-foreground text-[0.6875rem]">
                                            <th scope="col" className="px-3 py-2 font-medium">
                                                {t("colStage")}
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-3 py-2 text-right font-medium"
                                            >
                                                {t("colDpi")}
                                            </th>
                                            <th scope="col" className="px-3 py-2 font-medium">
                                                {t("colNearest")}
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-3 py-2 text-right font-medium"
                                            >
                                                {t("colChange")}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-border/60 divide-y">
                                        {stages.map((row) => (
                                            <tr key={row.stage} className="align-top">
                                                <th
                                                    scope="row"
                                                    className="px-3 py-1.5 font-medium whitespace-nowrap"
                                                >
                                                    {t("stageLabel", {
                                                        stage: formatter.number(row.stage),
                                                    })}
                                                    <span className="text-muted-foreground block text-[0.6875rem] font-normal">
                                                        {t("swipes", { count: row.swipes })}
                                                    </span>
                                                </th>
                                                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                                    {formatter.number(Math.round(row.dpi))}
                                                </td>
                                                <td className="text-muted-foreground px-3 py-1.5">
                                                    {row.nearest === null
                                                        ? t("nearestNone")
                                                        : t("nearest", {
                                                              setting: formatter.number(
                                                                  row.nearest,
                                                              ),
                                                              deviation: formatter.number(
                                                                  (row.dpi - row.nearest) /
                                                                      row.nearest,
                                                                  {
                                                                      style: "percent",
                                                                      maximumFractionDigits: 1,
                                                                      signDisplay: "exceptZero",
                                                                  },
                                                              ),
                                                          })}
                                                    {row.unchanged && (
                                                        <span className="text-destructive block text-[0.6875rem] font-medium">
                                                            {t("unchanged")}
                                                        </span>
                                                    )}
                                                    {row.spread > DPI_SPREAD_WARNING && (
                                                        <span className="text-syntax-number block text-[0.6875rem]">
                                                            {t("spread", {
                                                                percent: percent(row.spread),
                                                            })}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                                    {row.ratio === null
                                                        ? "—"
                                                        : t("change", {
                                                              ratio: formatter.number(row.ratio, {
                                                                  minimumFractionDigits: 2,
                                                                  maximumFractionDigits: 2,
                                                              }),
                                                          })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                            {t("stageHint")}
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
