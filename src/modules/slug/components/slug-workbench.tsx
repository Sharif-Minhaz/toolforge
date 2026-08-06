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
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    DEFAULT_SLUG_OPTIONS,
    MAX_SEPARATOR_LENGTH,
    MAX_SLUG_INPUT_LENGTH,
    MAX_SLUG_LENGTH,
    SAFE_SEPARATOR_CHARACTERS,
} from "../domain/constants";
import { createSlugExportFile } from "../domain/export";
import { isValidMaxLength, slugify } from "../domain/slugify";
import type { SlugFailure, SlugOptions, SlugSeparator } from "../types";
import { SeparatorPicker } from "./separator-picker";
import { SlugOptionsPanel } from "./slug-options";

type SlugWorkbenchProps = {
    initialText: string;
    initialSeparator: SlugSeparator;
    initialCustomSeparator: string;
};

export function SlugWorkbench({
    initialText,
    initialSeparator,
    initialCustomSeparator,
}: SlugWorkbenchProps) {
    const t = useTranslations("slug.workbench");
    const tToast = useTranslations("slug.toast");
    const tErrors = useTranslations("slug.errors");
    const formatter = useFormatter();

    const inputId = useId();
    const outputId = useId();
    const statusId = useId();
    const separatorLabelId = useId();

    const [text, setText] = useState(initialText);
    const [options, setOptions] = useState<SlugOptions>({
        ...DEFAULT_SLUG_OPTIONS,
        separator: initialSeparator,
        customSeparator: initialCustomSeparator,
    });
    const [lengthField, setLengthField] = useState(String(DEFAULT_SLUG_OPTIONS.maxLength));

    // Not capped: a list of titles is pasted whole, and a trimmed one
    // silently drops the last row. `slugify` refuses past the ceiling.
    const inputLimit = useInputLimit(text.length, MAX_SLUG_INPUT_LENGTH);

    // The two typed inputs settle before the slug is rebuilt; every discrete
    // control — a preset, a switch, a stepper — applies straight away.
    const settledText = useDebouncedValue(text);
    const settledSeparator = useDebouncedValue(options.customSeparator);
    const pending = settledText !== text || settledSeparator !== options.customSeparator;

    // Pure and deterministic, so the server-rendered pass already carries the
    // result and hydration has nothing to reconcile.
    const result = slugify(settledText, { ...options, customSeparator: settledSeparator });
    const slug = result.ok ? result.slug : "";
    const lengthInvalid = !isValidMaxLength(Number.parseInt(lengthField, 10));
    const separatorInvalid =
        !result.ok &&
        (result.reason === "unsafe_separator" || result.reason === "separator_too_long");

    function describeFailure(failure: SlugFailure): string {
        switch (failure.reason) {
            case "unsafe_separator":
                return tErrors("unsafeSeparator", {
                    character: failure.character ?? "",
                    characters: SAFE_SEPARATOR_CHARACTERS,
                });
            case "separator_too_long":
                return tErrors("separatorTooLong", {
                    max: formatter.number(MAX_SEPARATOR_LENGTH),
                });
            case "empty_result":
                return tErrors("emptyResult");
            case "too_long":
                return tErrors("tooLong", { max: formatter.number(MAX_SLUG_INPUT_LENGTH) });
        }
    }

    const status: { tone: StatusTone; message: string } = !result.ok
        ? { tone: "error", message: describeFailure(result) }
        : slug.length === 0
          ? { tone: "idle", message: t("statusEmpty") }
          : result.truncated
            ? {
                  tone: "warning",
                  message: t("statusTruncated", {
                      characters: formatter.number(result.length),
                      max: formatter.number(options.maxLength),
                  }),
              }
            : {
                  tone: "success",
                  message: t("statusReady", {
                      characters: formatter.number(result.length),
                      words: formatter.number(result.words),
                  }),
              };

    function patch(next: Partial<SlugOptions>) {
        setOptions((current) => ({ ...current, ...next }));
    }

    function handleLengthChange(raw: string) {
        // Only digits reach the field, so a pasted "40px" becomes 40 rather
        // than reading as invalid.
        const sanitized = raw.replace(/\D/g, "").slice(0, String(MAX_SLUG_LENGTH).length);
        setLengthField(sanitized);

        const parsed = Number.parseInt(sanitized, 10);

        if (isValidMaxLength(parsed)) {
            patch({ maxLength: parsed });
        }
    }

    function commitLength(value: number) {
        const clamped = Math.min(Math.max(value, 0), MAX_SLUG_LENGTH);

        setLengthField(String(clamped));
        patch({ maxLength: clamped });
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
        const copied = await copyText(slug);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const exported = createSlugExportFile({ content: slug, generatedAt: new Date() });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "slug.download_failed", { error: describeError(caught) });
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
                        placeholder={
                            options.perLine ? t("placeholderPerLine") : t("placeholderSingle")
                        }
                        spellCheck={false}
                        autoComplete="off"
                        className="bg-card/70 max-h-72 min-h-28 resize-y rounded-xl text-[0.9375rem] leading-6"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <Label id={separatorLabelId} className="text-muted-foreground text-xs">
                        {t("separatorLabel")}
                    </Label>
                    <SeparatorPicker
                        value={options.separator}
                        customSeparator={options.customSeparator}
                        invalid={separatorInvalid}
                        labelId={separatorLabelId}
                        onChange={(separator) => patch({ separator })}
                        onCustomChange={(customSeparator) => patch({ customSeparator })}
                    />
                </div>

                <SlugOptionsPanel
                    options={options}
                    lengthField={lengthField}
                    lengthInvalid={lengthInvalid}
                    onChange={patch}
                    onLengthChange={handleLengthChange}
                    onLengthCommit={commitLength}
                />

                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={outputId} className="text-muted-foreground text-xs">
                            {t("outputLabel")}
                        </Label>

                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopy}
                                disabled={slug.length === 0}
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
                                disabled={slug.length === 0}
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
                        value={slug}
                        placeholder={t("outputPlaceholder")}
                        spellCheck={false}
                        aria-describedby={statusId}
                        // Dimmed rather than emptied while the debounce settles,
                        // so the panel never flashes between two valid slugs.
                        className={cn(
                            "bg-muted/45 max-h-72 min-h-24 resize-y rounded-xl font-mono text-[0.8125rem] leading-6 break-all",
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
