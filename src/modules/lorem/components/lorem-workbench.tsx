"use client";

import { IconClipboardCheck, IconDownload, IconRefresh } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { MOTION_EASE } from "@/components/motion/motion-tokens";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LIVE_UPDATE_DEBOUNCE_MS } from "@/hooks/use-debounced-value";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { NumberStepper } from "@/modules/tools/components/number-stepper";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    LOREM_AMOUNT_PRESETS,
    LOREM_PARAGRAPH_PRESETS,
    MAX_LOREM_AMOUNT,
    MAX_LOREM_PARAGRAPHS,
    MIN_LOREM_AMOUNT,
    MIN_LOREM_PARAGRAPHS,
} from "../domain/constants";
import { LOREM_CORPORA, supportsOpener } from "../domain/corpora";
import { createLoremExportFile } from "../domain/export";
import { joinBlocks, renderBlocks } from "../domain/format";
import {
    clampAmount,
    clampParagraphCount,
    generateRandomText,
    isValidAmount,
    isValidParagraphCount,
    supportsParagraphSplit,
} from "../domain/generate";
import {
    LOREM_SOURCES,
    type LoremGenerationSuccess,
    type LoremOptions,
    type LoremSource,
    type LoremUnit,
} from "../types";
import { LoremOutput } from "./lorem-output";
import { UnitSelector } from "./unit-selector";

/** Corpus names are proper nouns, so they come from the domain, not messages. */
const SOURCE_ITEMS: Record<string, ReactNode> = Object.fromEntries(
    LOREM_SOURCES.map((source) => [source, LOREM_CORPORA[source].label]),
);

/** Everything the island needs to redisplay a batch without regenerating it. */
export type LoremDraft = Pick<LoremGenerationSuccess, "paragraphs" | "stats" | "lang">;

type LoremWorkbenchProps = {
    initialOptions: LoremOptions;
    /** Generated on the server so the first paint already shows a result. */
    initialDraft: LoremDraft;
};

const STAT_KEYS = ["words", "characters", "sentences", "paragraphs"] as const;

export function LoremWorkbench({ initialOptions, initialDraft }: LoremWorkbenchProps) {
    const t = useTranslations("lorem.workbench");
    const tToast = useTranslations("lorem.toast");
    const tErrors = useTranslations("lorem.errors");
    const tSources = useTranslations("lorem.sources");
    const formatter = useFormatter();
    const reduceMotion = useReducedMotion();

    const unitLabelId = useId();
    const amountInputId = useId();
    const amountHintId = useId();
    const paragraphInputId = useId();
    const paragraphHintId = useId();

    const [options, setOptions] = useState<LoremOptions>(initialOptions);
    const [amountInput, setAmountInput] = useState(String(initialOptions.amount));
    const [paragraphInput, setParagraphInput] = useState(String(initialOptions.paragraphs));
    const [draft, setDraft] = useState<LoremDraft>(initialDraft);
    const [generationId, setGenerationId] = useState(0);
    const [spinToken, setSpinToken] = useState(0);
    const [copiedKey, setCopiedKey] = useCopyFeedback<string>();
    const regenerateTimer = useRef<number | null>(null);

    const maxAmount = MAX_LOREM_AMOUNT[options.unit];
    const amountInvalid = !isValidAmount(options.unit, Number.parseInt(amountInput, 10));
    const paragraphInvalid = !isValidParagraphCount(Number.parseInt(paragraphInput, 10));
    const splitAvailable = supportsParagraphSplit(options.unit);
    const openerAvailable = supportsOpener(options.source);

    // Deriving the markup rather than regenerating means switching to HTML
    // shows the same passage in `<p>` tags instead of minting a new one.
    const blocks = renderBlocks(draft.paragraphs, options.format);
    const text = joinBlocks(blocks, options.format);

    const regenerate = useCallback(
        (next: LoremOptions) => {
            const result = generateRandomText(next);

            if (!result.ok) {
                logEvent("error", "lorem.generation_failed", {
                    reason: result.reason,
                    unit: next.unit,
                    amount: next.amount,
                    paragraphs: next.paragraphs,
                });
                toast.error(tErrors("generic"));

                return;
            }

            setDraft({
                paragraphs: result.paragraphs,
                stats: result.stats,
                lang: result.lang,
            });
            setGenerationId((current) => current + 1);
        },
        [tErrors],
    );

    const cancelScheduled = useCallback(() => {
        if (regenerateTimer.current === null) {
            return;
        }

        window.clearTimeout(regenerateTimer.current);
        regenerateTimer.current = null;
    }, []);

    useEffect(() => cancelScheduled, [cancelScheduled]);

    /**
     * `immediate` separates a deliberate choice — a preset, a step, a toggle —
     * from typing, where every keystroke would otherwise compose and render a
     * whole passage on the way to the number the reader actually wants.
     */
    function applyOptions(next: LoremOptions, immediate: boolean) {
        setOptions(next);
        cancelScheduled();

        if (!isValidAmount(next.unit, next.amount) || !isValidParagraphCount(next.paragraphs)) {
            return;
        }

        if (immediate) {
            regenerate(next);

            return;
        }

        regenerateTimer.current = window.setTimeout(() => {
            regenerateTimer.current = null;
            regenerate(next);
        }, LIVE_UPDATE_DEBOUNCE_MS);
    }

    function handleSourceChange(source: LoremSource) {
        applyOptions({ ...options, source }, true);
    }

    function handleUnitChange(unit: LoremUnit) {
        // Every unit has its own ceiling: 5000 words is a fine ask, 5000
        // paragraphs is not, so the amount comes down with the unit.
        const amount = clampAmount(unit, options.amount);

        setAmountInput(String(amount));
        applyOptions({ ...options, unit, amount }, true);
    }

    function applyAmount(raw: string, immediate: boolean) {
        const sanitized = raw.replace(/\D/g, "").slice(0, String(maxAmount).length);
        setAmountInput(sanitized);

        const parsed = Number.parseInt(sanitized, 10);

        if (!isValidAmount(options.unit, parsed)) {
            cancelScheduled();

            return;
        }

        applyOptions({ ...options, amount: parsed }, immediate);
    }

    function handleAmountStep(delta: number) {
        applyAmount(String(clampAmount(options.unit, options.amount + delta)), true);
    }

    function applyParagraphCount(raw: string, immediate: boolean) {
        const sanitized = raw.replace(/\D/g, "").slice(0, String(MAX_LOREM_PARAGRAPHS).length);
        setParagraphInput(sanitized);

        const parsed = Number.parseInt(sanitized, 10);

        if (!isValidParagraphCount(parsed)) {
            cancelScheduled();

            return;
        }

        applyOptions({ ...options, paragraphs: parsed }, immediate);
    }

    function handleParagraphStep(delta: number) {
        applyParagraphCount(String(clampParagraphCount(options.paragraphs + delta)), true);
    }

    function handleRegenerate() {
        if (amountInvalid || paragraphInvalid) {
            return;
        }

        cancelScheduled();
        setSpinToken((current) => current + 1);
        regenerate(options);
        toast.success(tToast("generated"));
    }

    function reportCopyFailure(failure: Extract<CopyResult, { ok: false }>) {
        const message =
            failure.reason === "empty"
                ? tToast("copyFailedEmpty")
                : failure.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function handleCopyParagraph(block: string, index: number) {
        const copied = await copyText(block);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        setCopiedKey(String(index));
        toast.success(tToast("copiedParagraph"));
    }

    async function handleCopyAll() {
        const copied = await copyText(text);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const file = createLoremExportFile({
            text,
            format: options.format,
            source: options.source,
            generatedAt: new Date(),
        });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (error) {
            logEvent("error", "lorem.download_failed", {
                format: options.format,
                error: describeError(error),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    return (
        <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <OptionSelect<LoremSource>
                        label={t("sourceLabel")}
                        hint={tSources(`${options.source}.tagline`)}
                        value={options.source}
                        items={SOURCE_ITEMS}
                        values={LOREM_SOURCES}
                        onChange={handleSourceChange}
                    />

                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label id={unitLabelId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("unitLabel")}</span>
                        </Label>
                        <UnitSelector
                            value={options.unit}
                            onChange={handleUnitChange}
                            labelId={unitLabelId}
                        />
                    </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <div className="flex min-w-0 flex-col gap-2">
                        <Label htmlFor={amountInputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("amountLabel")}</span>
                        </Label>
                        <NumberStepper
                            value={amountInput}
                            numeric={options.amount}
                            min={MIN_LOREM_AMOUNT}
                            max={maxAmount}
                            presets={LOREM_AMOUNT_PRESETS[options.unit]}
                            invalid={amountInvalid}
                            inputId={amountInputId}
                            describedById={amountHintId}
                            hint={
                                amountInvalid
                                    ? tErrors("amountRange", {
                                          min: MIN_LOREM_AMOUNT,
                                          max: maxAmount,
                                      })
                                    : t("amountHint", { min: MIN_LOREM_AMOUNT, max: maxAmount })
                            }
                            presetsLabel={t("amountPresets")}
                            decreaseLabel={t("decrease")}
                            increaseLabel={t("increase")}
                            onChange={(raw) => applyAmount(raw, false)}
                            onPreset={(preset) => applyAmount(String(preset), true)}
                            onStep={handleAmountStep}
                        />
                    </div>

                    <div className="flex min-w-0 flex-col gap-2">
                        <Label htmlFor={paragraphInputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("paragraphLabel")}</span>
                        </Label>
                        <NumberStepper
                            value={paragraphInput}
                            numeric={options.paragraphs}
                            min={MIN_LOREM_PARAGRAPHS}
                            max={MAX_LOREM_PARAGRAPHS}
                            presets={LOREM_PARAGRAPH_PRESETS}
                            invalid={paragraphInvalid}
                            // Counting paragraphs and then splitting across
                            // paragraphs is the same setting twice.
                            disabled={!splitAvailable}
                            inputId={paragraphInputId}
                            describedById={paragraphHintId}
                            hint={
                                !splitAvailable
                                    ? t("paragraphDisabled")
                                    : paragraphInvalid
                                      ? tErrors("paragraphRange", {
                                            min: MIN_LOREM_PARAGRAPHS,
                                            max: MAX_LOREM_PARAGRAPHS,
                                        })
                                      : t("paragraphHint", {
                                            min: MIN_LOREM_PARAGRAPHS,
                                            max: MAX_LOREM_PARAGRAPHS,
                                        })
                            }
                            presetsLabel={t("paragraphPresets")}
                            decreaseLabel={t("decrease")}
                            increaseLabel={t("increase")}
                            onChange={(raw) => applyParagraphCount(raw, false)}
                            onPreset={(preset) => applyParagraphCount(String(preset), true)}
                            onStep={handleParagraphStep}
                        />
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                    <OptionSwitch
                        label={t("openerLabel")}
                        hint={openerAvailable ? t("openerHint") : t("openerUnavailable")}
                        checked={options.startWithOpener && openerAvailable}
                        disabled={!openerAvailable}
                        onCheckedChange={(startWithOpener) =>
                            applyOptions({ ...options, startWithOpener }, true)
                        }
                    />
                    <OptionSwitch
                        label={t("htmlLabel")}
                        hint={t("htmlHint")}
                        checked={options.format === "html"}
                        // Pure re-rendering of the passage already generated,
                        // so it never costs the reader their current text.
                        onCheckedChange={(html) =>
                            setOptions((current) => ({
                                ...current,
                                format: html ? "html" : "plain",
                            }))
                        }
                    />
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        onClick={handleRegenerate}
                        disabled={amountInvalid || paragraphInvalid}
                        className="h-9 px-3.5"
                    >
                        <motion.span
                            key={spinToken}
                            initial={reduceMotion ? false : { rotate: -180 }}
                            animate={{ rotate: 0 }}
                            transition={{ duration: 0.32, ease: MOTION_EASE }}
                            className="grid place-items-center"
                        >
                            <IconRefresh className="size-4" stroke={1.9} aria-hidden="true" />
                        </motion.span>
                        {t("regenerate")}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={handleCopyAll}
                        disabled={text.length === 0}
                        className="h-9 px-3.5"
                    >
                        <IconClipboardCheck className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("copyAll")}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={handleDownload}
                        disabled={text.length === 0}
                        className="h-9 px-3.5"
                    >
                        <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </Button>
                </div>

                <dl aria-label={t("statsLabel")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {STAT_KEYS.map((key) => (
                        <div
                            key={key}
                            className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset"
                        >
                            <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t(`stats.${key}`)}
                            </dt>
                            <dd className="font-mono text-sm tabular-nums">
                                {formatter.number(draft.stats[key])}
                            </dd>
                        </div>
                    ))}
                </dl>

                <LoremOutput
                    blocks={blocks}
                    lang={draft.lang}
                    monospace={options.format === "html"}
                    stats={draft.stats}
                    generationId={generationId}
                    copiedKey={copiedKey}
                    onCopy={handleCopyParagraph}
                />
            </CardContent>
        </Card>
    );
}
