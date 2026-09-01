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
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import {
    DEFAULT_SORT_OPTIONS,
    MAX_SORT_INPUT_LENGTH,
    MAX_SORT_ITEMS,
    MAX_START_NUMBER,
    MIN_START_NUMBER,
} from "../domain/constants";
import { createSortExportFile } from "../domain/export";
import { drawShuffleSeed } from "../domain/shuffle";
import { sortLines } from "../domain/sort-lines";
import type { ListFormat, SortFailure, SortOptions, SortOrder } from "../types";
import { SortOptionsPanel } from "./sort-options";

type SortWorkbenchProps = {
    initialText: string;
    initialOrder: SortOrder;
    initialFormat: ListFormat;
    initialSplitMode: SortOptions["splitMode"];
    /**
     * Drawn on the server and handed over as a prop.
     *
     * A shuffle drawn during render would give the server one arrangement and
     * the browser another, and hydration would have nothing to reconcile them
     * with. Drawing it in a `useState` initialiser is the same bug wearing a
     * hook. See `docs/hydration-and-platform-pitfalls.md`.
     */
    initialSeed: number;
};

function isValidStartNumber(value: number): boolean {
    return Number.isInteger(value) && value >= MIN_START_NUMBER && value <= MAX_START_NUMBER;
}

export function SortWorkbench({
    initialText,
    initialOrder,
    initialFormat,
    initialSplitMode,
    initialSeed,
}: SortWorkbenchProps) {
    const t = useTranslations("sort.workbench");
    const tOrders = useTranslations("sort.orders");
    const tToast = useTranslations("sort.toast");
    const tErrors = useTranslations("sort.errors");
    const formatter = useFormatter();

    const inputId = useId();
    const outputId = useId();
    const statusId = useId();

    const [text, setText] = useState(initialText);
    const [options, setOptions] = useState<SortOptions>({
        ...DEFAULT_SORT_OPTIONS,
        order: initialOrder,
        format: initialFormat,
        splitMode: initialSplitMode,
    });
    const [startField, setStartField] = useState(String(DEFAULT_SORT_OPTIONS.startNumber));
    const [seed, setSeed] = useState(initialSeed);

    const { ref: resultRef, scrollToResult } = useResultScroll<HTMLDivElement>();

    // Not capped: a list is pasted whole, and a trimmed one silently drops its
    // last row. `sortLines` refuses past the ceiling instead.
    const inputLimit = useInputLimit(text.length, MAX_SORT_INPUT_LENGTH);

    // Only the typed value settles; every discrete control — an order chip, a
    // select, a switch, the reshuffle button — applies straight away.
    const settledText = useDebouncedValue(text);
    const pending = settledText !== text;

    // Pure and deterministic, seed included, so the server-rendered pass
    // already carries the result and hydration has nothing to reconcile.
    const result = sortLines(settledText, options, seed);
    const sorted = result.ok ? result.text : "";

    const startInvalid = !isValidStartNumber(Number.parseInt(startField, 10));

    function patch(next: Partial<SortOptions>) {
        setOptions((current) => ({ ...current, ...next }));

        // Only the two controls a reader presses to see a different answer
        // bring the result into view. Scrolling on every cleanup switch would
        // yank the page out from under somebody working down the panel — and
        // it is never scrolled to a destination that can turn out empty, which
        // with nothing pasted is exactly what the result box is.
        const deliberate = next.order !== undefined || next.format !== undefined;

        if (deliberate && text.trim().length > 0) {
            scrollToResult();
        }
    }

    function handleStartChange(raw: string) {
        // Only digits reach the field, so a pasted "10." becomes 10 rather than
        // reading as invalid.
        const sanitized = raw.replace(/\D/gu, "").slice(0, String(MAX_START_NUMBER).length);
        setStartField(sanitized);

        const parsed = Number.parseInt(sanitized, 10);

        if (isValidStartNumber(parsed)) {
            setOptions((current) => ({ ...current, startNumber: parsed }));
        }
    }

    function handleStartCommit(value: number) {
        const clamped = Math.min(Math.max(value, MIN_START_NUMBER), MAX_START_NUMBER);

        setStartField(String(clamped));
        setOptions((current) => ({ ...current, startNumber: clamped }));
    }

    function handleReshuffle() {
        // Drawn in an event handler rather than during render, which is what
        // keeps the first paint reproducible.
        setSeed(drawShuffleSeed(cryptoRandomBytes));
        scrollToResult();
    }

    function describeFailure(failure: SortFailure): string {
        switch (failure.reason) {
            case "too_long":
                return tErrors("tooLong", { max: formatter.number(MAX_SORT_INPUT_LENGTH) });
            case "too_many_items":
                return tErrors("tooManyItems", { max: formatter.number(MAX_SORT_ITEMS) });
            case "empty_result":
                return tErrors("emptyResult");
        }
    }

    const status: { tone: StatusTone; message: string } = !result.ok
        ? { tone: "error", message: describeFailure(result) }
        : settledText.trim().length === 0
          ? { tone: "idle", message: t("statusEmpty") }
          : result.unchanged
            ? { tone: "warning", message: t("statusUnchanged") }
            : {
                  tone: "success",
                  message: t("statusReady", {
                      items: formatter.number(result.counts.items),
                      order: tOrders(options.order),
                  }),
              };

    const removed = result.ok ? result.counts.blanksRemoved + result.counts.duplicatesRemoved : 0;

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
        const copied = await copyText(sorted);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const exported = createSortExportFile({
            content: sorted,
            order: options.order,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "sort.download_failed", { error: describeError(caught) });
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
                        placeholder={t("placeholder")}
                        spellCheck={false}
                        autoComplete="off"
                        className="bg-card/70 max-h-80 min-h-32 resize-y rounded-xl text-[0.9375rem] leading-6"
                    />
                    {/* Counted from the settled value, or the counter and the
                        result would disagree by a keystroke. */}
                    <p
                        className={cn(
                            "text-muted-foreground font-mono text-[0.6875rem] tabular-nums",
                            "transition-opacity duration-200",
                            pending && "opacity-55",
                        )}
                    >
                        {result.ok
                            ? t("inputStats", {
                                  lines: formatter.number(result.counts.lines),
                                  items: formatter.number(result.counts.split),
                              })
                            : null}
                        {result.ok && result.counts.joined > 0 && result.counts.wrapWidth !== null
                            ? ` · ${t("joinedNote", {
                                  joined: result.counts.joined,
                                  column: formatter.number(result.counts.wrapWidth),
                              })}`
                            : null}
                    </p>
                </div>

                <SortOptionsPanel
                    options={options}
                    startField={startField}
                    startInvalid={startInvalid}
                    onChange={patch}
                    onStartChange={handleStartChange}
                    onStartCommit={handleStartCommit}
                    onReshuffle={handleReshuffle}
                />

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
                                disabled={sorted.length === 0}
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
                                disabled={sorted.length === 0}
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
                        value={sorted}
                        placeholder={t("outputPlaceholder")}
                        spellCheck={false}
                        aria-describedby={statusId}
                        // Dimmed rather than emptied while the debounce settles,
                        // so the panel never flashes between two valid results.
                        className={cn(
                            "bg-muted/45 max-h-80 min-h-32 resize-y rounded-xl font-mono text-[0.875rem] leading-6",
                            "transition-opacity duration-200",
                            pending && "opacity-55",
                        )}
                    />

                    <div
                        className={cn(
                            "flex flex-col gap-1 transition-opacity duration-200",
                            pending && "opacity-55",
                        )}
                    >
                        <StatusStrip id={statusId} tone={status.tone} message={status.message} />
                        {result.ok && result.counts.items > 0 && (
                            <p className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                                {t("outputStats", {
                                    items: formatter.number(result.counts.items),
                                    characters: formatter.number(result.stats.characters),
                                })}
                                {removed > 0
                                    ? ` · ${t("cleanupNote", {
                                          blanks: result.counts.blanksRemoved,
                                          duplicates: result.counts.duplicatesRemoved,
                                      })}`
                                    : null}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
