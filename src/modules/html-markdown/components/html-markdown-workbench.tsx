"use client";

import { IconArrowsUpDown } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { getByteLength } from "@/modules/tools/domain/byte-size";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { MAX_HTML_MARKDOWN_INPUT_BYTES } from "../domain/constants";
import { convert } from "../domain/convert";
import { createHtmlMarkdownExportFile } from "../domain/export";
import type { HtmlMarkdownMode, HtmlMarkdownOptions, HtmlMarkdownResult } from "../types";
import { ConversionOptions } from "./conversion-options";
import { InputPanel } from "./input-panel";
import { ModeSelector } from "./mode-selector";
import { OutputPanel } from "./output-panel";

type HtmlMarkdownWorkbenchProps = {
    initialMode: HtmlMarkdownMode;
    initialText: string;
    initialOptions: HtmlMarkdownOptions;
    /**
     * The conversion of `initialText`, already done on the server.
     *
     * Turndown needs a DOM. In a browser it uses the platform's parser; on a
     * server it uses the one it bundles — and which of those two builds a
     * bundler hands to the server-rendered pass of a client component is the
     * bundler's decision, not ours. So the page converts once where the answer
     * is certain and passes it down, and nothing here calls the converter until
     * the reader changes something, by which point the code is running in a
     * browser that definitely has a parser.
     *
     * It costs one boolean and saves the first conversion being done twice.
     */
    initialResult: HtmlMarkdownResult;
};

export function HtmlMarkdownWorkbench({
    initialMode,
    initialText,
    initialOptions,
    initialResult,
}: HtmlMarkdownWorkbenchProps) {
    const t = useTranslations("htmlMarkdown.workbench");
    const tToast = useTranslations("htmlMarkdown.toast");
    const tErrors = useTranslations("htmlMarkdown.errors");
    const byteLabel = useByteLabel();

    const modeLabelId = useId();
    const inputId = useId();
    const outputId = useId();

    const [mode, setMode] = useState<HtmlMarkdownMode>(initialMode);
    const [text, setText] = useState(initialText);
    const [options, setOptions] = useState<HtmlMarkdownOptions>(initialOptions);
    const [touched, setTouched] = useState(false);

    // Converting on every keystroke would re-parse the whole document for each
    // character, which building a DOM makes expensive rather than merely
    // wasteful. The typed value settles first; every other control is a single
    // event and takes effect at once.
    const settledText = useDebouncedValue(text);
    const pending = settledText !== text;

    const result = touched ? convert({ mode, text: settledText, options }) : initialResult;

    const inputBytes = result.ok ? result.inputBytes : getByteLength(settledText);
    const output = result.ok ? result.output : "";
    const removed = result.ok ? result.removed : [];

    // A ceiling is a complaint about what was typed, so it belongs beside the
    // box. Anything else is a complaint about the conversion, and belongs where
    // the answer would have been.
    const inputError =
        !result.ok && result.reason === "too_large"
            ? tErrors("tooLarge", { limit: byteLabel(MAX_HTML_MARKDOWN_INPUT_BYTES) })
            : null;
    const outputError =
        !result.ok && result.reason === "unconvertible" ? tErrors("unconvertible") : null;

    const removedNotice =
        removed.length > 0
            ? tErrors("removedElements", {
                  elements: removed.map((element) => `<${element}>`).join(", "),
                  count: removed.length,
              })
            : null;

    const swappable = output.length > 0;

    function change<T>(apply: (value: T) => void): (value: T) => void {
        return (value) => {
            setTouched(true);
            apply(value);
        };
    }

    const handleTextChange = change<string>(setText);
    const handleModeChange = change<HtmlMarkdownMode>(setMode);
    const handleOptionsChange = change<Partial<HtmlMarkdownOptions>>((patch) => {
        setOptions((current) => ({ ...current, ...patch }));
    });

    function handleClear() {
        setTouched(true);
        setText("");
    }

    async function handleFileSelect(selected: File) {
        if (selected.size > MAX_HTML_MARKDOWN_INPUT_BYTES) {
            toast.error(
                tErrors("fileTooLarge", {
                    name: selected.name,
                    limit: byteLabel(MAX_HTML_MARKDOWN_INPUT_BYTES),
                }),
            );

            return;
        }

        try {
            const contents = await selected.text();

            setTouched(true);
            setText(contents);
            // A picked file names its own format, so the direction follows it
            // rather than leaving the reader to notice the mismatch.
            setMode(/\.(md|markdown)$/i.test(selected.name) ? "markdownToHtml" : "htmlToMarkdown");
            toast.success(tToast("fileLoaded", { name: selected.name }));
        } catch (caught) {
            logEvent("error", "html_markdown.file_read_failed", { error: describeError(caught) });
            toast.error(tErrors("fileUnreadable"));
        }
    }

    /** Feeds the result back in as input, so a round trip is one press. */
    function handleSwap() {
        if (!swappable) {
            return;
        }

        setTouched(true);
        setText(output);
        setMode(mode === "htmlToMarkdown" ? "markdownToHtml" : "htmlToMarkdown");
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
        const copied = await copyText(output);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const exported = createHtmlMarkdownExportFile({
            mode,
            content: output,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "html_markdown.download_failed", {
                mode,
                error: describeError(caught),
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

            <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <Label id={modeLabelId} className="text-muted-foreground text-xs">
                        {t("modeLabel")}
                    </Label>
                    <ModeSelector value={mode} onChange={handleModeChange} labelId={modeLabelId} />
                </div>

                <InputPanel
                    mode={mode}
                    text={text}
                    inputId={inputId}
                    inputBytes={inputBytes}
                    error={inputError}
                    onTextChange={handleTextChange}
                    onFileSelect={handleFileSelect}
                    onClear={handleClear}
                />

                <ConversionOptions mode={mode} options={options} onChange={handleOptionsChange} />

                <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <button
                                    type="button"
                                    onClick={handleSwap}
                                    disabled={!swappable}
                                    aria-label={t("swap")}
                                    className={cn(
                                        buttonVariants({ variant: "outline", size: "icon-sm" }),
                                        "rounded-full",
                                    )}
                                />
                            }
                        >
                            <IconArrowsUpDown className="size-4" stroke={1.8} aria-hidden="true" />
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("swap")}</TooltipContent>
                    </Tooltip>
                    <Separator className="flex-1" />
                </div>

                <OutputPanel
                    mode={mode}
                    outputId={outputId}
                    output={output}
                    outputBytes={result.ok ? result.outputBytes : 0}
                    error={outputError}
                    removedNotice={removedNotice}
                    pending={pending}
                    onCopy={handleCopy}
                    onDownload={handleDownload}
                />
            </CardContent>
        </Card>
    );
}
