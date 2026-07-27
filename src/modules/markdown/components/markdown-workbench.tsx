"use client";

import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconClipboardCheck,
    IconFileTypeHtml,
    IconMarkdown,
    IconPrinter,
    IconRefresh,
    IconX,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type UIEvent } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { MAX_MARKDOWN_LENGTH } from "../domain/constants";
import { applyEditAction, type EditorPlaceholders } from "../domain/editing";
import { createMarkdownExportFile } from "../domain/export";
import { parseMarkdown } from "../domain/parse";
import { mapScrollPosition } from "../domain/scroll-sync";
import { describeDocument } from "../domain/statistics";
import type { MarkdownEditAction, MarkdownExportFormat, MarkdownViewMode } from "../types";
import { DocumentStats } from "./document-stats";
import { EditorPanel } from "./editor-panel";
import { PreviewPanel } from "./preview-panel";
import { ViewModeSelector } from "./view-mode-selector";

type MarkdownWorkbenchProps = {
    initialText: string;
    initialView: MarkdownViewMode;
    initialSyncScroll: boolean;
    /** The starter document, localised on the server and restored by Reset. */
    sampleDocument: string;
};

export function MarkdownWorkbench({
    initialText,
    initialView,
    initialSyncScroll,
    sampleDocument,
}: MarkdownWorkbenchProps) {
    const t = useTranslations("markdown.workbench");
    const tToast = useTranslations("markdown.toast");
    const tErrors = useTranslations("markdown.errors");
    const tPlaceholders = useTranslations("markdown.placeholders");

    const viewLabelId = useId();
    const syncLabelId = useId();
    const editorId = useId();
    const editorLabelId = useId();
    const previewLabelId = useId();

    const [text, setText] = useState(initialText);
    const [view, setView] = useState<MarkdownViewMode>(initialView);
    const [syncScroll, setSyncScroll] = useState(initialSyncScroll);
    const [fullscreen, setFullscreen] = useState(false);

    const editorRef = useRef<HTMLTextAreaElement | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const renderedRef = useRef<HTMLDivElement | null>(null);
    /** Where the caret must land once a remounted textarea has been rendered. */
    const pendingSelection = useRef<{ start: number; end: number } | null>(null);
    /** Guards the scroll handlers from answering their own programmatic writes. */
    const syncing = useRef(false);

    // Re-parsing per keystroke would run the lexer over the whole document for
    // every character. The typed value settles first; every other control here
    // is discrete and applies at once.
    const settledText = useDebouncedValue(text);
    const pending = settledText !== text;

    // Pure and deterministic, so the server-rendered pass already carries the
    // preview and hydration has nothing to reconcile.
    const result = parseMarkdown(settledText);
    const statistics = describeDocument(settledText);
    const parsed = result.ok ? result.document : null;
    const error = result.ok
        ? null
        : tErrors("tooLarge", { limit: MAX_MARKDOWN_LENGTH, length: settledText.length });

    const placeholders: EditorPlaceholders = {
        linkLabel: tPlaceholders("linkLabel"),
        linkUrl: tPlaceholders("linkUrl"),
        imageAlt: tPlaceholders("imageAlt"),
        imageUrl: tPlaceholders("imageUrl"),
        tableHeader: tPlaceholders("tableHeader"),
        tableCell: tPlaceholders("tableCell"),
    };

    // Only the remount path needs this: moving the panes in or out of the
    // full-screen dialog builds a fresh textarea whose caret starts at the top.
    useEffect(() => {
        const selection = pendingSelection.current;
        const textarea = editorRef.current;

        if (selection === null || textarea === null) {
            return;
        }

        pendingSelection.current = null;
        textarea.setSelectionRange(selection.start, selection.end);
    });

    /**
     * A toolbar edit, applied to the value and the caret in one commit.
     *
     * Both halves of that matter, and each fixes a different jump:
     *
     * `flushSync` — React writes the new value into the textarea on commit, and
     * assigning a textarea's value drops its caret at the end and scrolls there.
     * Restoring the selection from a passive effect would leave one painted
     * frame at the bottom of the document, which is exactly what a format button
     * looked like it was doing. Flushing puts both in the same frame.
     *
     * `preventScroll` — the button takes focus on click, and handing focus back
     * without it makes the browser scroll the tall editor into view, moving the
     * page instead of the caret.
     */
    function handleAction(action: MarkdownEditAction) {
        const textarea = editorRef.current;
        const next = applyEditAction(
            action,
            {
                text,
                selectionStart: textarea?.selectionStart ?? text.length,
                selectionEnd: textarea?.selectionEnd ?? text.length,
            },
            placeholders,
        );

        flushSync(() => setText(next.text));

        const applied = editorRef.current;

        if (applied !== null) {
            applied.focus({ preventScroll: true });
            applied.setSelectionRange(next.selectionStart, next.selectionEnd);
        }
    }

    /**
     * Full screen moves the panes into a dialog, which remounts them. Carrying
     * the selection across puts the caret back where the writer left it, without
     * taking focus — the dialog decides where focus goes on the way in.
     */
    function handleFullscreenChange(next: boolean) {
        const textarea = editorRef.current;

        if (textarea !== null) {
            pendingSelection.current = {
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
            };
        }

        setFullscreen(next);
    }

    function linkScroll(source: HTMLElement | null, target: HTMLElement | null) {
        if (!syncScroll || source === null || target === null || syncing.current) {
            return;
        }

        syncing.current = true;
        target.scrollTop = mapScrollPosition(
            {
                scrollTop: source.scrollTop,
                scrollHeight: source.scrollHeight,
                clientHeight: source.clientHeight,
            },
            { scrollHeight: target.scrollHeight, clientHeight: target.clientHeight },
        );

        // Writing scrollTop fires the other pane's handler, which would write
        // back and fight this one. The flag clears on the next frame, after that
        // echo has been ignored.
        window.requestAnimationFrame(() => {
            syncing.current = false;
        });
    }

    function handleEditorScroll(event: UIEvent<HTMLTextAreaElement>) {
        linkScroll(event.currentTarget, previewRef.current);
    }

    function handlePreviewScroll(event: UIEvent<HTMLDivElement>) {
        linkScroll(event.currentTarget, editorRef.current);
    }

    function handleReset() {
        setText(sampleDocument);
        toast.success(tToast("reset"));
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
        const copied = await copyText(text);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownload(format: MarkdownExportFormat) {
        const exported = createMarkdownExportFile({
            format,
            source: text,
            // The preview's own markup, which React produced from the parsed
            // nodes — so it is already escaped by the time it is serialised.
            renderedHtml: renderedRef.current?.innerHTML ?? "",
            title: parsed?.outline[0]?.title ?? t("untitled"),
            includeMathStyles: parsed?.hasMath ?? false,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "markdown.download_failed", {
                format,
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    function handlePrint() {
        window.print();
    }

    const showEditor = view !== "preview";
    const showPreview = view !== "editor";
    const exportable = error === null && text.length > 0;

    /**
     * One copy of the workbench, rendered either in the card or in the
     * full-screen dialog — never both, so there is a single textarea, a single
     * preview, and one of each ref.
     */
    const body = (
        <>
            <div className="flex shrink-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                {/* The label is read, not drawn. Rendering it above the segmented
                    control made that column two rows tall while the switch and the
                    buttons beside it stayed one, so nothing in the row shared a
                    centre line. The three options name the control on their own. */}
                <div className="min-w-0 xl:max-w-md xl:flex-1">
                    <Label id={viewLabelId} className="sr-only">
                        {t("viewLabel")}
                    </Label>
                    <ViewModeSelector value={view} onChange={setView} labelId={viewLabelId} />
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div
                        className={cn(
                            "flex items-center gap-2 transition-opacity duration-200",
                            view !== "split" && "opacity-55",
                        )}
                    >
                        <Switch
                            checked={syncScroll}
                            disabled={view !== "split"}
                            onCheckedChange={(next) => setSyncScroll(next)}
                            aria-labelledby={syncLabelId}
                        />
                        <span id={syncLabelId} className="text-[0.8125rem] leading-[1.3]">
                            {t("syncScroll")}
                        </span>
                    </div>

                    {/* Six outline buttons in a row read as one undifferentiated
                        block. Emphasis carries the meaning instead: full screen is
                        the only filled button, the two document actions stay plain,
                        and the three export destinations are a separated group with
                        a hue each, so "which one is HTML" is answered by colour
                        rather than by reading every label. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                            variant={fullscreen ? "secondary" : "default"}
                            size="sm"
                            onClick={() => handleFullscreenChange(!fullscreen)}
                        >
                            {fullscreen ? (
                                <IconArrowsMinimize
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            ) : (
                                <IconArrowsMaximize
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            )}
                            {fullscreen ? t("exitFullscreen") : t("fullscreen")}
                        </Button>

                        <span aria-hidden="true" className="bg-border/70 mx-0.5 h-5 w-px" />

                        <Button variant="outline" size="sm" onClick={handleReset}>
                            <IconRefresh
                                className="text-muted-foreground size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("reset")}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopy}
                            disabled={text.length === 0}
                        >
                            <IconClipboardCheck
                                className="text-muted-foreground size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("copy")}
                        </Button>

                        <span aria-hidden="true" className="bg-border/70 mx-0.5 h-5 w-px" />

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload("markdown")}
                            disabled={text.length === 0}
                        >
                            <IconMarkdown
                                className="text-brand-violet size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("downloadMarkdown")}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload("html")}
                            disabled={!exportable}
                        >
                            <IconFileTypeHtml
                                className="text-brand-amber size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("downloadHtml")}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePrint}
                            disabled={!exportable}
                        >
                            <IconPrinter
                                className="text-brand-cyan size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("print")}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Both panes stay mounted whichever view is chosen: the preview
                is what Print and the HTML export read, and a pane that was
                unmounted would have nothing to give them. */}
            <div
                className={cn(
                    "grid gap-4",
                    view === "split" && "lg:grid-cols-2",
                    // One height for the row from `lg` up, so both panes end on
                    // the same line however tall the editor's toolbar is. Below
                    // that the panes stack and size themselves.
                    fullscreen ? "min-h-0 flex-1" : "lg:h-120",
                )}
            >
                <div className={cn("min-h-0 min-w-0", !showEditor && "hidden")}>
                    <EditorPanel
                        text={text}
                        inputId={editorId}
                        labelId={editorLabelId}
                        textareaRef={editorRef}
                        onChange={setText}
                        onAction={handleAction}
                        onScroll={handleEditorScroll}
                        fill={fullscreen}
                    />
                </div>

                <div className={cn("min-h-0 min-w-0", !showPreview && "hidden")}>
                    <PreviewPanel
                        parsed={parsed}
                        error={error}
                        pending={pending}
                        labelId={previewLabelId}
                        scrollRef={previewRef}
                        contentRef={renderedRef}
                        onScroll={handlePreviewScroll}
                        fill={fullscreen}
                    />
                </div>
            </div>

            <DocumentStats statistics={statistics} />
        </>
    );

    return (
        <>
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
                    {fullscreen ? (
                        <div className="bg-muted/40 ring-border/60 flex flex-col items-start gap-3 rounded-xl p-5 ring-1 ring-inset">
                            <p className="text-muted-foreground text-[0.8125rem] leading-6">
                                {t("fullscreenActive")}
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleFullscreenChange(false)}
                            >
                                <IconArrowsMinimize
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("exitFullscreen")}
                            </Button>
                        </div>
                    ) : (
                        body
                    )}
                </CardContent>
            </Card>

            {/* A dialog rather than a positioned div: it is portalled to the
                document body, so no ancestor's transform, overflow or padding
                can reach it, and it brings the focus trap and the Escape key
                that a bare overlay would have to reinvent. */}
            <Sheet open={fullscreen} onOpenChange={handleFullscreenChange}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="bg-background text-foreground w-full max-w-none gap-0 rounded-none p-0 data-[side=bottom]:inset-0 data-[side=bottom]:h-full data-[side=bottom]:border-t-0 sm:max-w-none"
                >
                    <SheetDescription className="sr-only">
                        {t("fullscreenDescription")}
                    </SheetDescription>

                    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
                        <div className="flex shrink-0 items-center justify-between gap-3">
                            <SheetTitle className="truncate text-sm leading-[1.3] font-medium">
                                {t("title")}
                            </SheetTitle>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleFullscreenChange(false)}
                                aria-label={t("exitFullscreen")}
                                className="text-muted-foreground hover:text-foreground -mr-1 shrink-0"
                            >
                                <IconX
                                    className="size-6 cursor-pointer"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                            </Button>
                        </div>

                        {fullscreen ? body : null}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
