"use client";

import { IconClipboardCheck, IconDownload, IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    DEFAULT_TEXT_CASE_OPTIONS,
    MAX_TEXT_CASE_INPUT_LENGTH,
    supportsAcronyms,
} from "../domain/constants";
import { convertCase } from "../domain/convert";
import { createTextCaseExportFile } from "../domain/export";
import { describeText } from "../domain/statistics";
import type { TextCase, TextCaseFailure, TextCaseOptions, TextStats } from "../types";
import { CasePicker } from "./case-picker";
import { useCaseName } from "./use-case-name";

type TextCaseWorkbenchProps = {
    initialText: string;
    initialCase: TextCase;
};

export function TextCaseWorkbench({ initialText, initialCase }: TextCaseWorkbenchProps) {
    const t = useTranslations("textCase.workbench");
    const tToast = useTranslations("textCase.toast");
    const tErrors = useTranslations("textCase.errors");
    const formatter = useFormatter();

    const inputId = useId();
    const outputId = useId();
    const statusId = useId();
    const caseLabelId = useId();

    const [text, setText] = useState(initialText);
    const [options, setOptions] = useState<TextCaseOptions>({
        ...DEFAULT_TEXT_CASE_OPTIONS,
        textCase: initialCase,
    });

    const { ref: resultRef, scrollToResult } = useResultScroll<HTMLDivElement>();

    // Not capped: a passage is pasted whole, and a trimmed one silently drops
    // its last line. `convertCase` refuses past the ceiling instead.
    const inputLimit = useInputLimit(text.length, MAX_TEXT_CASE_INPUT_LENGTH);

    // Only the typed value settles; every discrete control — a case chip, a
    // switch — applies straight away.
    const settledText = useDebouncedValue(text);
    const pending = settledText !== text;

    // Pure and deterministic, so the server-rendered pass already carries the
    // result and hydration has nothing to reconcile.
    const result = convertCase(settledText, options);
    const converted = result.ok ? result.text : "";

    // Counted from the settled value, or the counter and the result would
    // disagree by a keystroke.
    const inputStats = describeText(settledText);
    const acronymsAvailable = supportsAcronyms(options.textCase);

    const caseName = useCaseName()(options.textCase);

    function describeStats(stats: TextStats): string {
        return t("stats", {
            characters: formatter.number(stats.characters),
            words: formatter.number(stats.words),
            lines: formatter.number(stats.lines),
        });
    }

    function describeFailure(failure: TextCaseFailure): string {
        switch (failure.reason) {
            case "too_long":
                return tErrors("tooLong", {
                    max: formatter.number(MAX_TEXT_CASE_INPUT_LENGTH),
                });
            case "empty_result":
                return tErrors("emptyResult", { name: caseName });
        }
    }

    const status: { tone: StatusTone; message: string } = !result.ok
        ? { tone: "error", message: describeFailure(result) }
        : settledText.length === 0
          ? { tone: "idle", message: t("statusEmpty") }
          : result.unchanged
            ? { tone: "warning", message: t("statusUnchanged", { name: caseName }) }
            : {
                  tone: "success",
                  message: t("statusReady", {
                      name: caseName,
                      characters: formatter.number(result.stats.characters),
                      words: formatter.number(result.stats.words),
                  }),
              };

    function patch(next: Partial<TextCaseOptions>) {
        setOptions((current) => ({ ...current, ...next }));
    }

    function handleCaseChange(textCase: TextCase) {
        patch({ textCase });

        // Never scrolled to a destination that can turn out empty: with nothing
        // typed, the box the reader would be sent to says nothing at all.
        if (text.trim().length > 0) {
            scrollToResult();
        }
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
        const exported = createTextCaseExportFile({
            content: converted,
            textCase: options.textCase,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "text_case.download_failed", { error: describeError(caught) });
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

            <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                            {t("inputLabel")}
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <InputLimitMeter reading={inputLimit} />
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
                        placeholder={options.perLine ? t("placeholderPerLine") : t("placeholder")}
                        spellCheck={false}
                        autoComplete="off"
                        className="bg-card/70 max-h-80 min-h-32 resize-y rounded-xl text-[0.9375rem] leading-6"
                    />
                    <p
                        className={cn(
                            "text-muted-foreground font-mono text-[0.6875rem] tabular-nums",
                            "transition-opacity duration-200",
                            pending && "opacity-55",
                        )}
                    >
                        {describeStats(inputStats)}
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <Label id={caseLabelId} className="text-muted-foreground text-xs">
                        {t("caseLabel")}
                    </Label>
                    <CasePicker
                        value={options.textCase}
                        labelId={caseLabelId}
                        onChange={handleCaseChange}
                    />
                    <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-[1.4]">
                        {t("caseHint")}
                    </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                    <OptionSwitch
                        label={t("perLineLabel")}
                        hint={t("perLineHint")}
                        checked={options.perLine}
                        onCheckedChange={(perLine) => patch({ perLine })}
                    />
                    {/* Disabled rather than silently ignored: a switch that does
                        nothing on nine of the fourteen cases has to say which
                        one it is standing down for. */}
                    <OptionSwitch
                        label={t("acronymsLabel")}
                        hint={
                            acronymsAvailable
                                ? t("acronymsHint")
                                : t("acronymsHintUnavailable", { name: caseName })
                        }
                        checked={options.preserveAcronyms && acronymsAvailable}
                        disabled={!acronymsAvailable}
                        onCheckedChange={(preserveAcronyms) => patch({ preserveAcronyms })}
                    />
                </div>

                <div ref={resultRef} className="flex scroll-mt-24 flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={outputId} className="text-muted-foreground text-xs">
                            {t("outputLabel")}
                        </Label>

                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
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
                        aria-describedby={statusId}
                        // Dimmed rather than emptied while the debounce settles,
                        // so the panel never flashes between two valid results.
                        className={cn(
                            "bg-muted/45 max-h-80 min-h-32 resize-y rounded-xl text-[0.9375rem] leading-6",
                            "transition-opacity duration-200",
                            pending && "opacity-55",
                        )}
                    />

                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        className={cn("transition-opacity duration-200", pending && "opacity-55")}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
