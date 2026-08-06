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
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    isRepairable,
    MAX_JSON_DEPTH,
    MAX_JSON_INPUT_BYTES,
    SAMPLE_JSON,
} from "../domain/constants";
import { createJsonExportFile } from "../domain/export";
import { describeSizeDelta, type JsonFormatResult } from "../domain/format";
import type { JsonError } from "@/modules/tools/types/json-tree";

import type { JsonFormatOptions, JsonMode } from "../types";
import { FormatOptions } from "./format-options";
import { InputPanel } from "./input-panel";
import { ModeSelector } from "./mode-selector";
import { JsonNotices } from "./notices";
import { OutputPanel } from "./output-panel";
import { useJsonFormat } from "./use-json-format";
import { ValidationReport } from "./validation-report";

type JsonWorkbenchProps = {
    initialMode: JsonMode;
    initialText: string;
    initialOptions: JsonFormatOptions;
    /**
     * Computed on the server from exactly these values, so the first paint
     * already carries the result and hydration has nothing to reconcile.
     */
    initialResult: JsonFormatResult;
};

export function JsonWorkbench({
    initialMode,
    initialText,
    initialOptions,
    initialResult,
}: JsonWorkbenchProps) {
    const t = useTranslations("json.workbench");
    const tToast = useTranslations("json.toast");
    const tErrors = useTranslations("json.errors");
    const byteLabel = useByteLabel();

    const modeLabelId = useId();
    const inputId = useId();
    const outputId = useId();

    const [mode, setMode] = useState<JsonMode>(initialMode);
    const [text, setText] = useState(initialText);
    const [options, setOptions] = useState<JsonFormatOptions>(initialOptions);

    /**
     * One message per failure, with the position already folded in. Every key is
     * spelled out rather than built from the code, so a renamed message is a
     * type error instead of a blank line in production.
     */
    function describeFailure(error: JsonError): string {
        const at = { line: error.line, column: error.column };
        const found = error.found ?? "";

        const message = (() => {
            switch (error.code) {
                case "empty":
                    return "";
                case "too_large":
                    return tErrors("too_large", { limit: byteLabel(MAX_JSON_INPUT_BYTES) });
                case "too_deep":
                    return tErrors("too_deep", { limit: MAX_JSON_DEPTH });
                case "unexpected_token":
                    return error.expected === undefined
                        ? tErrors("unexpected_token", { ...at, found })
                        : tErrors("unexpected_token_expected", {
                              ...at,
                              found,
                              expected: error.expected,
                          });
                case "unexpected_end":
                    return error.expected === undefined
                        ? tErrors("unexpected_end", at)
                        : tErrors("unexpected_end_expected", { ...at, expected: error.expected });
                case "unterminated_string":
                    return tErrors("unterminated_string", at);
                case "invalid_escape":
                    return tErrors("invalid_escape", { ...at, found });
                case "invalid_number":
                    return tErrors("invalid_number", at);
                case "invalid_literal":
                    return tErrors("invalid_literal", { ...at, found });
                case "control_character":
                    return tErrors("control_character", at);
                case "trailing_content":
                    return tErrors("trailing_content", at);
                case "trailing_comma":
                    return tErrors("trailing_comma", at);
                case "missing_comma":
                    return tErrors("missing_comma", at);
                case "comment":
                    return tErrors("comment", at);
                case "non_standard_quote":
                    return tErrors("non_standard_quote", at);
                case "unquoted_key":
                    return tErrors("unquoted_key", { ...at, found });
                case "non_standard_literal":
                    return tErrors("non_standard_literal", { ...at, found });
                case "root_not_container":
                    return tErrors("root_not_container");
                case "unpaired_surrogate":
                    return tErrors("unpaired_surrogate", at);
            }
        })();

        // Offering the fix is only honest when Repair would actually take it.
        return isRepairable(error.code) && !options.repair
            ? `${message} ${tErrors("repairHint")}`
            : message;
    }

    function updateOptions(patch: Partial<JsonFormatOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    // Reformatting on every keystroke would hand the worker a fresh copy of the
    // whole document for each character.
    const settledText = useDebouncedValue(text);

    // Off the main thread: a large document is seconds of uninterruptible
    // parsing, and on this thread those seconds are a frozen tab.
    const { result, pending: formatting } = useJsonFormat(
        { mode, input: settledText, options },
        initialResult,
    );

    const pending = settledText !== text || formatting;

    const idle = !result.ok && result.error.code === "empty";
    const output = result.ok ? result.output : "";
    const error = result.ok || idle ? null : describeFailure(result.error);
    const advisories = result.ok ? result.advisories : [];
    const repairs = result.ok ? result.repairs : [];

    const delta = result.ok ? describeSizeDelta(result.inputBytes, result.outputBytes) : null;
    const sizeLabel =
        delta === null || mode === "validate" || output.length === 0
            ? null
            : delta.direction === "smaller"
              ? t("sizeSmaller", { percent: delta.percent })
              : delta.direction === "larger"
                ? t("sizeLarger", { percent: delta.percent })
                : t("sizeSame");

    function handleSample() {
        setText(SAMPLE_JSON);
        toast.success(tToast("sampleLoaded"));
    }

    async function handleFileSelect(selected: File) {
        if (selected.size > MAX_JSON_INPUT_BYTES) {
            toast.error(
                tErrors("fileTooLarge", {
                    name: selected.name,
                    limit: byteLabel(MAX_JSON_INPUT_BYTES),
                }),
            );

            return;
        }

        try {
            // JSON is text by definition, so the file goes straight into the
            // box the user can then edit.
            setText(await selected.text());
            toast.success(tToast("fileLoaded", { name: selected.name }));
        } catch (caught) {
            logEvent("error", "json.file_read_failed", { error: describeError(caught) });
            toast.error(tErrors("fileUnreadable"));
        }
    }

    /** Feeds the result back in, so beautify → minify is one click. */
    const swappable = output.length > 0;

    function handleSwap() {
        if (!swappable) {
            return;
        }

        setText(output);
        setMode(mode === "beautify" ? "minify" : "beautify");
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
        const exported = createJsonExportFile({ mode, content: output, generatedAt: new Date() });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "json.download_failed", { mode, error: describeError(caught) });
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
                        <span className="leading-[1.3]">{t("modeLabel")}</span>
                    </Label>
                    <ModeSelector value={mode} onChange={setMode} labelId={modeLabelId} />
                </div>

                <InputPanel
                    mode={mode}
                    text={text}
                    inputId={inputId}
                    inputBytes={result.inputBytes}
                    onTextChange={setText}
                    onFileSelect={handleFileSelect}
                    onSample={handleSample}
                    onClear={() => setText("")}
                />

                <FormatOptions mode={mode} options={options} onChange={updateOptions} />

                {mode !== "validate" && (
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
                                <IconArrowsUpDown
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("swap")}</TooltipContent>
                        </Tooltip>
                        <Separator className="flex-1" />
                    </div>
                )}

                {mode === "validate" ? (
                    <ValidationReport
                        verdict={idle ? "idle" : result.ok ? "valid" : "invalid"}
                        error={error}
                        stats={result.ok ? result.stats : null}
                        advisories={advisories}
                        repairs={repairs}
                        pending={pending}
                    />
                ) : (
                    <>
                        <OutputPanel
                            outputId={outputId}
                            output={output}
                            outputBytes={result.ok ? result.outputBytes : 0}
                            sizeLabel={sizeLabel}
                            error={error}
                            pending={pending}
                            onCopy={handleCopy}
                            onDownload={handleDownload}
                        />
                        <JsonNotices advisories={advisories} repairs={repairs} />
                    </>
                )}
            </CardContent>
        </Card>
    );
}
