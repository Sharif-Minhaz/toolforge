"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { OptionsDisclosure } from "@/modules/tools/components/workbench-step";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { MAX_SQL_INPUT_BYTES, MAX_SQL_NESTING_DEPTH } from "../domain/constants";
import { createSqlExportFile } from "../domain/export";
import { formatSql } from "../domain/format";
import type { SqlFormatFailure, SqlFormatOptions } from "../types";
import { DialectPicker, FormatOptions, useDialectLabel } from "./format-options";
import { InputPanel } from "./input-panel";
import { OutputPanel } from "./output-panel";

type SqlFormatterWorkbenchProps = {
    initialText: string;
    initialOptions: SqlFormatOptions;
};

export function SqlFormatterWorkbench({ initialText, initialOptions }: SqlFormatterWorkbenchProps) {
    const tToast = useTranslations("sqlFormatter.toast");
    const tErrors = useTranslations("sqlFormatter.errors");
    const byteLabel = useByteLabel();
    const dialectLabel = useDialectLabel();

    const inputId = useId();
    const outputId = useId();

    const [text, setText] = useState(initialText);
    const [options, setOptions] = useState<SqlFormatOptions>(initialOptions);

    // The parser is the expensive part, so the typed value settles first and
    // every other control is a single event that takes effect at once.
    const settledText = useDebouncedValue(text);
    const pending = settledText !== text;

    // Memoised, unlike most derivations here: every keystroke re-renders this
    // component while `settledText` stays put, and re-parsing an unchanged
    // 64 KiB script on each one would cost a quarter of a second apiece.
    const result = useMemo(() => formatSql({ text: settledText, options }), [settledText, options]);

    const output = result.ok ? result.output : "";

    function describeFailure(failure: SqlFormatFailure): string {
        switch (failure.reason) {
            case "too_large":
                return tErrors("tooLarge", { limit: byteLabel(MAX_SQL_INPUT_BYTES) });
            case "too_deep":
                return tErrors("tooDeep", { depth: MAX_SQL_NESTING_DEPTH });
            case "unparseable":
                return failure.line === undefined || failure.column === undefined
                    ? tErrors("unparseableAnywhere", { dialect: dialectLabel(options.dialect) })
                    : tErrors("unparseable", {
                          dialect: dialectLabel(options.dialect),
                          line: failure.line,
                          column: failure.column,
                      });
        }
    }

    // Every refusal is about what was typed — too much of it, nested too
    // deep, or not readable as the chosen dialect — so it sits under the box.
    const inputError = result.ok ? null : describeFailure(result);

    function patchOptions(patch: Partial<SqlFormatOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    async function handleFileSelect(selected: File) {
        if (selected.size > MAX_SQL_INPUT_BYTES) {
            toast.error(
                tErrors("fileTooLarge", {
                    name: selected.name,
                    limit: byteLabel(MAX_SQL_INPUT_BYTES),
                }),
            );

            return;
        }

        try {
            setText(await selected.text());
            toast.success(tToast("fileLoaded", { name: selected.name }));
        } catch (caught) {
            logEvent("error", "sql_formatter.file_read_failed", { error: describeError(caught) });
            toast.error(tErrors("fileUnreadable"));
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
        const copied = await copyText(output);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const exported = createSqlExportFile({ content: output, generatedAt: new Date() });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "sql_formatter.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <DialectPicker options={options} onChange={patchOptions} />

                    <OptionsDisclosure>
                        <FormatOptions options={options} onChange={patchOptions} />
                    </OptionsDisclosure>
                </div>

                {/* Input beside result on a wide screen; stacked on a narrow one. */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <InputPanel
                        text={text}
                        inputId={inputId}
                        inputBytes={result.inputBytes}
                        error={inputError}
                        onTextChange={setText}
                        onFileSelect={handleFileSelect}
                        onClear={() => setText("")}
                    />

                    <OutputPanel
                        outputId={outputId}
                        output={output}
                        outputBytes={result.ok ? result.outputBytes : 0}
                        pending={pending}
                        onCopy={handleCopy}
                        onDownload={handleDownload}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
