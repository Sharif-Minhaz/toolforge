"use client";

import {
    IconArrowsExchange,
    IconClipboardCheck,
    IconDownload,
    IconSparkles,
    IconX,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { describeText } from "@/modules/tools/domain/text-stats";
import { BIJOY_SAMPLE, MAX_BIJOY_INPUT_LENGTH } from "../domain/constants";
import { convertBijoy } from "../domain/convert";
import { createBijoyExportFile } from "../domain/export";
import type { BijoyDirection, BijoyResult } from "../types";
import { DirectionSelector } from "./direction-selector";

type BijoyWorkbenchProps = {
    initialText: string;
    initialDirection: BijoyDirection;
};

export function BijoyWorkbench({ initialText, initialDirection }: BijoyWorkbenchProps) {
    const t = useTranslations("bijoyUnicode.workbench");
    const tToast = useTranslations("bijoyUnicode.toast");
    const tErrors = useTranslations("bijoyUnicode.errors");
    const formatter = useFormatter();

    const inputId = useId();
    const outputId = useId();
    const statusId = useId();
    const directionLabelId = useId();

    const [text, setText] = useState(initialText);
    const [direction, setDirection] = useState<BijoyDirection>(initialDirection);

    // Not capped: a document is pasted whole, and a trimmed one silently loses
    // its last paragraph. `convertBijoy` refuses past the ceiling instead.
    const inputLimit = useInputLimit(text.length, MAX_BIJOY_INPUT_LENGTH);

    // Only the typed value settles; the direction switch applies at once.
    const settledText = useDebouncedValue(text);
    const pending = settledText !== text;

    // Pure and deterministic, so the server-rendered pass already carries the
    // result and hydration has nothing to reconcile.
    const result = convertBijoy(settledText, direction);
    const converted = result.ok ? result.text : "";
    const inputStats = describeText(settledText);

    const status = describeStatus(result);

    function describeStatus(current: BijoyResult): { tone: StatusTone; message: string } {
        if (!current.ok) {
            return {
                tone: "error",
                message: tErrors("tooLong", { max: formatter.number(MAX_BIJOY_INPUT_LENGTH) }),
            };
        }

        if (settledText.trim().length === 0) {
            return { tone: "idle", message: t("statusEmpty") };
        }

        if (current.notice === "already_unicode") {
            return { tone: "warning", message: t("notices.alreadyUnicode") };
        }

        if (current.notice === "no_bangla") {
            return { tone: "warning", message: t("notices.noBangla") };
        }

        return {
            tone: "success",
            message: t(`statusReady.${direction}`, {
                characters: formatter.number(current.stats.characters),
            }),
        };
    }

    // Swapping hands the result back as the input, so the reader can check a
    // conversion by running it the other way. Done from the settled result, so
    // it never takes a half-typed input's stale output.
    function handleSwap() {
        setText(converted);
        setDirection((current) => (current === "to-unicode" ? "to-bijoy" : "to-unicode"));
    }

    function handleSample() {
        setText(direction === "to-unicode" ? BIJOY_SAMPLE.bijoy : BIJOY_SAMPLE.unicode);
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

    async function handleCopy() {
        const copied = await copyText(converted);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const exported = createBijoyExportFile({
            content: converted,
            direction,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "bijoy_unicode.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <Label id={directionLabelId} className="text-muted-foreground text-xs">
                        {t("directionLabel")}
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                            <DirectionSelector
                                value={direction}
                                labelId={directionLabelId}
                                onChange={setDirection}
                            />
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleSwap}
                            // A tooltip, not an aria-label: the accessible name
                            // has to contain the word the button shows.
                            title={t("swapLabel")}
                            className="h-10 shrink-0 self-start sm:self-auto"
                        >
                            <IconArrowsExchange
                                className="size-4"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("swap")}
                        </Button>
                    </div>
                    <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-[1.4]">
                        {t(`directionHints.${direction}`)}
                    </p>
                </div>

                {/* Step 1 beside step 2 on a wide screen; stacked on a narrow one. */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-3">
                        <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                            <StepLabel step={1} htmlFor={inputId}>
                                {t("inputLabel")}
                            </StepLabel>
                            <div className="flex items-center gap-1.5">
                                <InputLimitMeter reading={inputLimit} />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSample}
                                    title={t("sampleLabel")}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <IconSparkles
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("sample")}
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => setText("")}
                                    disabled={text.length === 0}
                                    aria-label={t("clear")}
                                    className={cn(
                                        buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                        "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                        <Textarea
                            id={inputId}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder={t(`placeholders.${direction}`)}
                            spellCheck={false}
                            autoComplete="off"
                            // Bijoy is Latin letters as far as the browser
                            // knows; marking it Bangla would only mislead a
                            // screen reader.
                            lang={direction === "to-bijoy" ? "bn" : undefined}
                            className="bg-card/70 max-h-96 min-h-40 resize-y rounded-xl text-[0.9375rem] leading-7"
                        />
                        <p
                            className={cn(
                                "text-muted-foreground font-mono text-[0.6875rem] tabular-nums",
                                "transition-opacity duration-200",
                                pending && "opacity-55",
                            )}
                        >
                            {t("stats", {
                                characters: formatter.number(inputStats.characters),
                                words: formatter.number(inputStats.words),
                                lines: formatter.number(inputStats.lines),
                            })}
                        </p>
                    </div>

                    <div className={RESULT_TRAY}>
                        <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                            <StepLabel step={2} htmlFor={outputId}>
                                {t("outputLabel")}
                            </StepLabel>

                            <div className="flex items-center gap-1.5">
                                <Button
                                    size="sm"
                                    onClick={handleCopy}
                                    disabled={converted.length === 0}
                                >
                                    <IconClipboardCheck
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("copy")}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDownload}
                                    disabled={converted.length === 0}
                                >
                                    <IconDownload
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("download")}
                                </Button>
                            </div>
                        </div>

                        <Textarea
                            id={outputId}
                            readOnly
                            value={converted}
                            placeholder={t("outputPlaceholder")}
                            spellCheck={false}
                            lang={direction === "to-unicode" ? "bn" : undefined}
                            aria-describedby={statusId}
                            // Dimmed rather than emptied while the debounce
                            // settles, so the panel never flashes.
                            className={cn(
                                "bg-card max-h-96 min-h-40 resize-y rounded-lg text-[0.9375rem] leading-7",
                                "transition-opacity duration-200",
                                pending && "opacity-55",
                            )}
                        />

                        <StatusStrip
                            id={statusId}
                            tone={status.tone}
                            message={status.message}
                            className={cn(
                                "transition-opacity duration-200",
                                pending && "opacity-55",
                            )}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
