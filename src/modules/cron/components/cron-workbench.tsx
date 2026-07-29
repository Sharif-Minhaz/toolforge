"use client";

import { IconDownload, IconMapPin, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { NumberStepper } from "@/modules/tools/components/number-stepper";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { ZonePicker } from "@/modules/tools/components/zone-picker";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    getTimeZoneCity,
    getTimeZoneRegion,
    resolveLocalTimeZone,
} from "@/modules/tools/domain/time-zones";
import { analyzeCron } from "../domain/analyze";
import {
    MAX_EXPRESSION_LENGTH,
    MAX_RUN_COUNT,
    MIN_RUN_COUNT,
    RUN_COUNT_PRESETS,
} from "../domain/constants";
import { createCronExportFile } from "../domain/export";
import { CRON_WEEKDAY_BASES, type CronFailure, type CronWeekdayBase } from "../types";
import { CronFieldGrid } from "./cron-field-grid";
import { CronPresets } from "./cron-presets";
import { NextRunsPanel } from "./next-runs-panel";
import { useCronSentence } from "./use-cron-sentence";

const TICK_MS = 1000;

type CronWorkbenchProps = {
    initialExpression: string;
    initialTimeZone: string;
    initialWeekdayBase: CronWeekdayBase;
    initialRunCount: number;
    /** The server's clock, so the first paint matches and hydration is quiet. */
    initialNowMs: number;
};

type CronOptions = {
    readonly timeZone: string;
    readonly weekdayBase: CronWeekdayBase;
    readonly runCount: number;
};

export function CronWorkbench({
    initialExpression,
    initialTimeZone,
    initialWeekdayBase,
    initialRunCount,
    initialNowMs,
}: CronWorkbenchProps) {
    const t = useTranslations("cron.workbench");
    const tErrors = useTranslations("cron.errors");
    const tToast = useTranslations("cron.toast");
    const { renderExplanation } = useCronSentence();

    const inputId = useId();
    const statusId = useId();
    const runCountId = useId();
    const runCountHintId = useId();

    const [expression, setExpression] = useState(initialExpression);
    const [options, setOptions] = useState<CronOptions>({
        timeZone: initialTimeZone,
        weekdayBase: initialWeekdayBase,
        runCount: initialRunCount,
    });
    const [region, setRegion] = useState(() => getTimeZoneRegion(initialTimeZone));
    const [runCountText, setRunCountText] = useState(String(initialRunCount));
    const [nowMs, setNowMs] = useState(initialNowMs);
    const [copiedField, setCopiedField] = useCopyFeedback<string>();

    // One clock for the whole tool, so the countdown and the run list can never
    // disagree about which run is next.
    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);

        return () => window.clearInterval(timer);
    }, []);

    // The server cannot know the reader's zone, so the button that jumps to it
    // only appears once the browser has taken over.
    const hydrated = useIsHydrated();
    const localTimeZone = hydrated ? resolveLocalTimeZone() : options.timeZone;

    // Recomputing per keystroke would re-parse and re-render every panel for
    // each half-typed field; the typed value settles first.
    const settled = useDebouncedValue(expression);
    const pending = settled !== expression;

    // Pure and deterministic given `nowMs`, so the server-rendered pass already
    // carries the answer.
    const result = analyzeCron({
        expression: settled,
        weekdayBase: options.weekdayBase,
        timeZone: options.timeZone,
        runCount: options.runCount,
        now: nowMs,
    });

    function patch(next: Partial<CronOptions>) {
        setOptions((current) => ({ ...current, ...next }));
    }

    function describeFailure(failure: CronFailure): string {
        const field = failure.field === undefined ? "" : t(`fields.${failure.field}`);
        const token = failure.token ?? "";

        switch (failure.reason) {
            case "empty":
                return tErrors("empty");
            case "too_long":
                return tErrors("tooLong", { max: MAX_EXPRESSION_LENGTH });
            case "field_count":
                return tErrors("fieldCount");
            case "unknown_macro":
                return tErrors("unknownMacro", { token });
            case "empty_term":
                return tErrors("emptyTerm", { field });
            case "invalid_term":
                return tErrors("invalidTerm", { field, token });
            case "out_of_range":
                return tErrors("outOfRange", { field, token });
            case "reversed_range":
                return tErrors("reversedRange", { field, token });
            case "invalid_step":
                return tErrors("invalidStep", { field, token });
            case "unsupported_syntax":
                return tErrors("unsupportedSyntax", { field, token });
            case "invalid_nth":
                return tErrors("invalidNth", { token });
        }
    }

    const statusTone: StatusTone = !result.ok
        ? result.reason === "empty"
            ? "idle"
            : "error"
        : pending
          ? "pending"
          : "success";

    // `@reboot` has no columns at all, so counting them would be a lie.
    const statusMessage = !result.ok
        ? describeFailure(result)
        : result.expression.reboot
          ? t("readAsReboot")
          : t("readAs", {
                count: result.expression.fieldCount,
                base: t(`bases.${options.weekdayBase}`),
            });

    function reportCopyFailure(failure: Extract<CopyResult, { ok: false }>) {
        const message =
            failure.reason === "empty"
                ? tToast("copyFailedEmpty")
                : failure.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function handleCopy(field: string, value: string) {
        const copied = await copyText(value);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        setCopiedField(field);
    }

    function handleRunCountChange(raw: string) {
        setRunCountText(raw);

        const parsed = Number.parseInt(raw, 10);

        if (Number.isInteger(parsed) && parsed >= MIN_RUN_COUNT && parsed <= MAX_RUN_COUNT) {
            patch({ runCount: parsed });
        }
    }

    function setRunCount(value: number) {
        const clamped = Math.min(Math.max(value, MIN_RUN_COUNT), MAX_RUN_COUNT);

        setRunCountText(String(clamped));
        patch({ runCount: clamped });
    }

    function handleTimeZoneChange(timeZone: string) {
        setRegion(getTimeZoneRegion(timeZone));
        patch({ timeZone });
    }

    function handleDownload() {
        if (!result.ok) {
            return;
        }

        const exported = createCronExportFile({
            source: result.expression.source,
            timeZone: result.timeZone,
            runs: result.schedule.runs,
            generatedAt: new Date(nowMs),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "cron.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const runCountInvalid = String(options.runCount) !== runCountText.trim();

    return (
        <div className={cn("flex flex-col gap-6", TOOL_ACCENT_VARS.emerald)}>
            <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                <span
                    aria-hidden="true"
                    className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
                />

                <CardHeader>
                    <CardTitle className="text-lg">{t("title")}</CardTitle>
                    <CardDescription>{t("description")}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("inputLabel")}</span>
                        </Label>

                        <div
                            className={cn(
                                "bg-card flex items-center gap-1 rounded-xl px-2 ring-1 transition-colors duration-200 ring-inset",
                                statusTone === "error"
                                    ? "ring-destructive"
                                    : "ring-input focus-within:ring-ring focus-within:ring-2",
                            )}
                        >
                            <input
                                id={inputId}
                                type="text"
                                value={expression}
                                spellCheck={false}
                                autoComplete="off"
                                autoCapitalize="off"
                                autoCorrect="off"
                                maxLength={MAX_EXPRESSION_LENGTH}
                                placeholder={t("inputPlaceholder")}
                                aria-describedby={statusId}
                                aria-invalid={statusTone === "error"}
                                onChange={(event) => setExpression(event.target.value)}
                                className="text-primary h-12 min-w-0 flex-1 bg-transparent px-1.5 font-mono text-base tracking-wide outline-none sm:text-lg"
                            />
                            {expression.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setExpression("")}
                                    aria-label={t("clear")}
                                    className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                                >
                                    <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                                </button>
                            )}
                            <IconCopyButton
                                copied={copiedField === "expression"}
                                aria-label={t("copyExpression")}
                                onClick={() => handleCopy("expression", expression)}
                            />
                        </div>

                        <StatusStrip id={statusId} tone={statusTone} message={statusMessage} />
                    </div>

                    {result.ok && (
                        <>
                            <div
                                className={cn(
                                    "rounded-xl px-4 py-3 ring-1 transition-opacity duration-200 ring-inset",
                                    "bg-[color-mix(in_oklch,var(--tool-accent)_10%,transparent)]",
                                    "ring-[color-mix(in_oklch,var(--tool-accent)_22%,transparent)]",
                                    pending && "opacity-55",
                                )}
                            >
                                <p className="text-[0.9375rem] leading-[1.6] font-medium sm:text-base">
                                    {renderExplanation(result.explanation)}
                                </p>
                                {result.explanation.dayUnion && (
                                    <p className="text-muted-foreground mt-1.5 text-[0.75rem] leading-normal">
                                        {t("dayUnionNote")}
                                    </p>
                                )}
                            </div>

                            <CronFieldGrid expression={result.expression} pending={pending} />
                        </>
                    )}

                    <CronPresets active={expression.trim()} onSelect={setExpression} />

                    <Separator />

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                        <div className="flex flex-col gap-2">
                            <ZonePicker
                                region={region}
                                timeZone={options.timeZone}
                                regionLabel={t("regionLabel")}
                                cityLabel={t("cityLabel")}
                                onRegionChange={setRegion}
                                onTimeZoneChange={(timeZone) => patch({ timeZone })}
                            />
                            {hydrated && localTimeZone !== options.timeZone && (
                                <div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleTimeZoneChange(localTimeZone)}
                                    >
                                        <IconMapPin
                                            className="size-3.5"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                        {t("useLocalZone", {
                                            zone: getTimeZoneCity(localTimeZone),
                                        })}
                                    </Button>
                                </div>
                            )}
                        </div>

                        <OptionSelect
                            label={t("weekdayBaseLabel")}
                            hint={t("weekdayBaseHint")}
                            value={options.weekdayBase}
                            items={{
                                unix: t("bases.unix"),
                                quartz: t("bases.quartz"),
                            }}
                            values={CRON_WEEKDAY_BASES}
                            onChange={(weekdayBase) => patch({ weekdayBase })}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={runCountId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("runCountLabel")}</span>
                        </Label>
                        <NumberStepper
                            value={runCountText}
                            numeric={options.runCount}
                            min={MIN_RUN_COUNT}
                            max={MAX_RUN_COUNT}
                            presets={RUN_COUNT_PRESETS}
                            invalid={runCountInvalid}
                            inputId={runCountId}
                            describedById={runCountHintId}
                            hint={t("runCountHint", { min: MIN_RUN_COUNT, max: MAX_RUN_COUNT })}
                            presetsLabel={t("runCountPresets")}
                            decreaseLabel={t("runCountDecrease")}
                            increaseLabel={t("runCountIncrease")}
                            onChange={handleRunCountChange}
                            onPreset={setRunCount}
                            onStep={(delta) => setRunCount(options.runCount + delta)}
                        />
                    </div>
                </CardContent>
            </Card>

            {result.ok && (
                <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                    <CardHeader>
                        <CardTitle className="text-lg">{t("runsTitle")}</CardTitle>
                        <CardDescription>{t("runsDescription")}</CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-4">
                        {!result.timeZoneSupported && (
                            <p
                                role="status"
                                className="text-brand-amber text-[0.6875rem] leading-normal"
                            >
                                {t("unsupportedZone", { zone: options.timeZone })}
                            </p>
                        )}

                        <NextRunsPanel
                            schedule={result.schedule}
                            timeZone={result.timeZone}
                            nowMs={nowMs}
                            pending={pending}
                            copiedField={copiedField}
                            onCopy={handleCopy}
                        />

                        {result.schedule.runs.length > 0 && (
                            <div>
                                <Button variant="outline" size="sm" onClick={handleDownload}>
                                    <IconDownload
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("download")}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
