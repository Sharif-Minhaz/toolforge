"use client";

import {
    IconArrowsExchange,
    IconChevronDown,
    IconChevronUp,
    IconClipboardCheck,
    IconDownload,
    IconTrash,
    IconWand,
} from "@tabler/icons-react";
import { useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { compareTexts } from "../domain/compare";
import {
    COLLAPSE_CONTEXT_LINES,
    MAX_DIFF_CELLS,
    MAX_DIFF_FILE_BYTES,
    MAX_DIFF_INPUT_LENGTH,
    MAX_DIFF_LINES,
    SAMPLE_LEFT,
    SAMPLE_RIGHT,
} from "../domain/constants";
import { buildUnifiedPatch, createDiffExportFile } from "../domain/export";
import {
    countChangeRuns,
    countCollapsible,
    isChangedRow,
    isChangedUnifiedLine,
    toDiffEntries,
    toUnifiedLines,
} from "../domain/rows";
import {
    DIFF_PRECISIONS,
    DIFF_VIEWS,
    type DiffFailure,
    type DiffPrecision,
    type DiffSide,
    type DiffView,
    type DiffWorkbenchOptions,
} from "../types";
import { DiffInputPanel } from "./diff-input-panel";
import { SplitDiffView, UnifiedDiffView } from "./diff-viewer";

type DiffWorkbenchProps = {
    initialView: DiffView;
    initialPrecision: DiffPrecision;
};

export function DiffWorkbench({ initialView, initialPrecision }: DiffWorkbenchProps) {
    const t = useTranslations("diff.workbench");
    const tErrors = useTranslations("diff.errors");
    const tToast = useTranslations("diff.toast");
    const formatter = useFormatter();
    const byteLabel = useByteLabel();
    const reducedMotion = useReducedMotion();

    const leftId = useId();
    const rightId = useId();
    const statusId = useId();

    const viewerRef = useRef<HTMLDivElement>(null);

    const [left, setLeft] = useState("");
    const [right, setRight] = useState("");
    const [activeChange, setActiveChange] = useState(0);
    const [options, setOptions] = useState<DiffWorkbenchOptions>({
        view: initialView,
        precision: initialPrecision,
        ignoreCase: false,
        ignoreWhitespace: false,
        hideUnchanged: false,
    });

    function patch(next: Partial<DiffWorkbenchOptions>) {
        setOptions((current) => ({ ...current, ...next }));
    }

    // Comparing is quadratic in the size of both sides, so it waits for the
    // typing to settle rather than running on every keystroke. Everything below
    // is derived from the settled pair, which keeps the counts and the table
    // describing the same comparison.
    const settledLeft = useDebouncedValue(left);
    const settledRight = useDebouncedValue(right);
    const stale = settledLeft !== left || settledRight !== right;

    const result = compareTexts(settledLeft, settledRight, options);
    const rows = result.ok ? result.rows : [];

    const changeCount = countChangeRuns(rows, isChangedRow);
    const collapsible = countCollapsible(rows, isChangedRow, COLLAPSE_CONTEXT_LINES);
    const folding = options.hideUnchanged && collapsible > 0;
    const context = folding ? COLLAPSE_CONTEXT_LINES : null;
    const position = changeCount === 0 ? 0 : Math.min(activeChange, changeCount - 1);

    // Only the shown panel is built: Base UI unmounts the other one, but its
    // children would still be evaluated on every render.
    const splitEntries =
        result.ok && options.view === "split" ? toDiffEntries(rows, isChangedRow, context) : null;
    const unifiedEntries =
        result.ok && options.view === "unified"
            ? toDiffEntries(toUnifiedLines(rows), isChangedUnifiedLine, context)
            : null;

    function describeFailure(failure: DiffFailure): string {
        switch (failure.reason) {
            case "empty":
                return t("statusEmpty");
            case "too_long":
                return tErrors("tooLong", { max: formatter.number(MAX_DIFF_INPUT_LENGTH) });
            case "too_many_lines":
                return tErrors("tooManyLines", { max: formatter.number(MAX_DIFF_LINES) });
            case "too_large":
                return tErrors("tooLarge", { max: formatter.number(MAX_DIFF_CELLS) });
        }
    }

    const status: { tone: StatusTone; message: string } = !result.ok
        ? { tone: result.reason === "empty" ? "idle" : "error", message: describeFailure(result) }
        : result.identical
          ? { tone: "success", message: t("statusIdentical") }
          : {
                tone: "warning",
                message: t("statusSummary", {
                    added: result.stats.added,
                    removed: result.stats.removed,
                    changed: result.stats.changed,
                }),
            };

    function goToChange(next: number) {
        if (changeCount === 0) {
            return;
        }

        const index = ((next % changeCount) + changeCount) % changeCount;

        setActiveChange(index);
        viewerRef.current
            ?.querySelector(`[data-change="${index}"]`)
            ?.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
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

    async function handleCopyPatch() {
        const content = buildUnifiedPatch(rows);

        if (content.length === 0) {
            toast.error(tToast("nothingToExport"));

            return;
        }

        const copied = await copyText(content);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(tToast("copiedPatch"));
    }

    function handleDownload() {
        const exported = createDiffExportFile({ rows, generatedAt: new Date() });

        if (exported.content.length === 0) {
            toast.error(tToast("nothingToExport"));

            return;
        }

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "diff.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    async function handleFileSelect(side: DiffSide, file: File) {
        if (file.size > MAX_DIFF_FILE_BYTES) {
            toast.error(
                tToast("fileTooLarge", {
                    filename: file.name,
                    max: byteLabel(MAX_DIFF_FILE_BYTES),
                }),
            );

            return;
        }

        try {
            const text = await file.text();

            if (side === "left") {
                setLeft(text);
            } else {
                setRight(text);
            }

            toast.success(tToast("fileLoaded", { filename: file.name }));
        } catch (caught) {
            logEvent("error", "diff.file_read_failed", { error: describeError(caught) });
            toast.error(tToast("fileUnreadable", { filename: file.name }));
        }
    }

    function handleSwap() {
        setLeft(right);
        setRight(left);
    }

    function handleExample() {
        setLeft(SAMPLE_LEFT);
        setRight(SAMPLE_RIGHT);
    }

    function handleClear() {
        setLeft("");
        setRight("");
    }

    const emptyViewer = (
        <p className="ring-border/70 text-muted-foreground rounded-xl px-4 py-10 text-center text-sm ring-1 ring-inset">
            {t("unavailable")}
        </p>
    );

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
                <div className="grid gap-4 lg:grid-cols-2">
                    <DiffInputPanel
                        side="left"
                        inputId={leftId}
                        value={left}
                        onChange={setLeft}
                        onFileSelect={(file) => handleFileSelect("left", file)}
                    />
                    <DiffInputPanel
                        side="right"
                        inputId={rightId}
                        value={right}
                        onChange={setRight}
                        onFileSelect={(file) => handleFileSelect("right", file)}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={handleExample}>
                        <IconWand className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("example")}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSwap}
                        disabled={left.length === 0 && right.length === 0}
                    >
                        <IconArrowsExchange className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("swap")}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        disabled={left.length === 0 && right.length === 0}
                    >
                        <IconTrash className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                </div>

                <div className="flex flex-col gap-1">
                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        className="[&>span]:min-w-0 [&>span]:wrap-break-word"
                    />

                    {result.ok && result.stats.ignoredMatches > 0 && (
                        <p className="text-muted-foreground pl-5 text-[0.6875rem] leading-normal">
                            {t("ignoredNote", { count: result.stats.ignoredMatches })}
                        </p>
                    )}
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    <OptionSelect
                        label={t("precisionLabel")}
                        hint={t("precisionHint")}
                        value={options.precision}
                        values={DIFF_PRECISIONS}
                        items={Object.fromEntries(
                            DIFF_PRECISIONS.map((precision) => [
                                precision,
                                t(`precisions.${precision}`),
                            ]),
                        )}
                        onChange={(precision) => patch({ precision })}
                    />
                    <OptionSwitch
                        label={t("ignoreCase.label")}
                        hint={t("ignoreCase.hint")}
                        checked={options.ignoreCase}
                        onCheckedChange={(ignoreCase) => patch({ ignoreCase })}
                    />
                    <OptionSwitch
                        label={t("ignoreWhitespace.label")}
                        hint={t("ignoreWhitespace.hint")}
                        checked={options.ignoreWhitespace}
                        onCheckedChange={(ignoreWhitespace) => patch({ ignoreWhitespace })}
                    />
                    <OptionSwitch
                        label={t("hideUnchanged.label")}
                        // Folding is only ever offered when there is something
                        // to fold; the hint says which of the two it is.
                        hint={
                            collapsible === 0
                                ? t("hideUnchanged.hintDisabled")
                                : t("hideUnchanged.hint", { context: COLLAPSE_CONTEXT_LINES })
                        }
                        checked={folding}
                        disabled={collapsible === 0}
                        onCheckedChange={(hideUnchanged) => patch({ hideUnchanged })}
                    />
                </div>

                {/* One Tabs root over both the strip and the panels: a
                    `role="tab"` with no panel to control is a control screen
                    readers cannot explain. The ref sits outside it so the step
                    buttons can find a row in whichever panel is mounted. */}
                <div ref={viewerRef}>
                    <Tabs
                        value={options.view}
                        onValueChange={(value) => {
                            // Base UI hands the value back untyped; matching it
                            // against the union keeps the cast out of the code.
                            const next = DIFF_VIEWS.find((candidate) => candidate === value);

                            if (next) {
                                patch({ view: next });
                            }
                        }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <TabsList className="w-full max-w-56">
                                {DIFF_VIEWS.map((view) => (
                                    <TabsTrigger key={view} value={view}>
                                        {t(`views.${view}`)}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {changeCount > 0 && (
                                <div className="flex items-center gap-1">
                                    <span
                                        aria-live="polite"
                                        className="text-muted-foreground mr-1 text-[0.6875rem] tabular-nums"
                                    >
                                        {t("changePosition", {
                                            index: position + 1,
                                            total: changeCount,
                                        })}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => goToChange(position - 1)}
                                        aria-label={t("previousChange")}
                                    >
                                        <IconChevronUp
                                            className="size-4"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => goToChange(position + 1)}
                                        aria-label={t("nextChange")}
                                    >
                                        <IconChevronDown
                                            className="size-4"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                    </Button>
                                </div>
                            )}
                        </div>

                        <TabsContent value="split">
                            {splitEntries === null ? (
                                emptyViewer
                            ) : (
                                <SplitDiffView entries={splitEntries} stale={stale} />
                            )}
                        </TabsContent>

                        <TabsContent value="unified">
                            {unifiedEntries === null ? (
                                emptyViewer
                            ) : (
                                <UnifiedDiffView entries={unifiedEntries} stale={stale} />
                            )}
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyPatch}
                        disabled={!result.ok || result.identical}
                    >
                        <IconClipboardCheck className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("copyPatch")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        disabled={!result.ok || result.identical}
                    >
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
