"use client";

import {
    IconAlertTriangle,
    IconArrowsUpDown,
    IconBinary,
    IconClipboardCheck,
    IconDownload,
    IconFileUpload,
    IconWand,
    IconX,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveBlob, saveFile } from "@/modules/tools/domain/file-saver";
import type { HighlightLanguage } from "@/modules/tools/domain/highlight";
import { bytesToBsonText } from "../domain/bson-codec";
import {
    highlightLanguageFor,
    INPUT_PLACEHOLDERS,
    MAX_INPUT_LENGTH,
    maxFileBytes,
    SAMPLE_BSON_HEX,
    SAMPLE_JSON,
    SAMPLE_TOON,
} from "../domain/constants";
import { convert } from "../domain/convert";
import { createBsonDownload, createTextExportFile } from "../domain/export";
import type { ConversionFailure, ConversionOptions, DataFormat } from "../types";
import { ConversionOptions as OptionsPanel, FormatPicker } from "./conversion-options";
import { NotesList } from "./notes-list";

type BsonWorkbenchProps = {
    initialSource: DataFormat;
    initialTarget: DataFormat;
    initialInput: string;
    initialOptions: ConversionOptions;
};

export function BsonWorkbench({
    initialSource,
    initialTarget,
    initialInput,
    initialOptions,
}: BsonWorkbenchProps) {
    const t = useTranslations("bson.workbench");
    const tErrors = useTranslations("bson.errors");
    const tToast = useTranslations("bson.toast");

    const inputId = useId();
    const statusId = useId();
    const fileInput = useRef<HTMLInputElement>(null);

    const [source, setSource] = useState<DataFormat>(initialSource);
    const [target, setTarget] = useState<DataFormat>(initialTarget);
    const [input, setInput] = useState(initialInput);
    const [options, setOptions] = useState<ConversionOptions>(initialOptions);

    // A full parse and a full write of a document that may be a megabyte of
    // hex, so it settles before running. The option controls are discrete and
    // stay instant.
    const settled = useDebouncedValue(input);
    const pending = settled !== input;

    // Derived during render from a pure function, so the server-rendered pass
    // already carries the result and hydration has nothing to reconcile.
    const result = convert({ source, target, input: settled, options });
    const output = result.ok ? result.output : "";

    // The two boxes hold different notations, so each names its own tokenizer.
    // The input's follows `input` rather than `settled`: the coloured copy sits
    // *behind* the textarea, so a debounced language would leave the backdrop a
    // notation behind the glyphs for 300 ms.
    const inputLanguage: HighlightLanguage = highlightLanguageFor(source, options.bsonEncoding);

    // Not capped: a document is pasted whole, and one trimmed mid-value is
    // invalid rather than truncated. `convert` refuses past the ceiling.
    const inputLimit = useInputLimit(input.length, MAX_INPUT_LENGTH);
    const outputLanguage: HighlightLanguage = highlightLanguageFor(target, options.bsonEncoding);

    function describeFailure(failure: ConversionFailure): string | null {
        switch (failure.reason) {
            case "empty":
                return null;
            case "too_large":
                return tErrors("tooLarge", { max: MAX_INPUT_LENGTH });
            case "invalid_hex":
                return tErrors("invalidHex");
            case "invalid_base64":
                return tErrors("invalidBase64");
            case "invalid_bson":
                return failure.declaredBytes === undefined
                    ? tErrors("invalidBson")
                    : tErrors("invalidBsonSized", {
                          declared: failure.declaredBytes,
                          actual: failure.actualBytes ?? 0,
                      });
            case "invalid_json":
                return tErrors("invalidJson");
            case "invalid_toon":
                return failure.line === undefined
                    ? tErrors("invalidToon")
                    : tErrors("invalidToonLine", { line: failure.line });
            case "root_not_object":
                return tErrors("rootNotObject");
        }
    }

    const failure = result.ok ? null : describeFailure(result);
    const status: { tone: StatusTone; message: string } = result.ok
        ? { tone: "success", message: t("statusReady", { notes: result.notes.length }) }
        : failure === null
          ? { tone: "idle", message: t("statusEmpty") }
          : { tone: "error", message: failure };

    function sizeSummary(): string | null {
        if (!result.ok || result.inputLength === 0) {
            return null;
        }

        const ratio = (result.inputLength - result.outputLength) / result.inputLength;
        const values = { input: result.inputLength, output: result.outputLength };

        if (result.outputLength === result.inputLength) {
            return t("sizeSame", values);
        }

        return ratio > 0
            ? t("sizeSmaller", { ...values, ratio })
            : t("sizeLarger", { ...values, ratio: -ratio });
    }

    /** Picking the side the other one already holds means "swap", not "both". */
    function selectSource(next: DataFormat) {
        if (next === target) {
            setTarget(source);
        }

        setSource(next);
    }

    function selectTarget(next: DataFormat) {
        if (next === source) {
            setSource(target);
        }

        setTarget(next);
    }

    function handleSwap() {
        if (output.length === 0) {
            return;
        }

        setInput(output);
        setSource(target);
        setTarget(source);
    }

    function handleExample() {
        setInput(
            source === "bson" ? SAMPLE_BSON_HEX : source === "toon" ? SAMPLE_TOON : SAMPLE_JSON,
        );

        // The sample is hex whichever notation the panel is on, so the control
        // follows rather than handing the reader a document it cannot read.
        if (source === "bson" && options.bsonEncoding !== "hex") {
            setOptions((current) => ({ ...current, bsonEncoding: "hex" }));
        }
    }

    async function handleFile(file: File | undefined) {
        if (file === undefined) {
            return;
        }

        if (file.size > maxFileBytes(options.bsonEncoding)) {
            toast.error(tToast("fileTooLarge"));

            return;
        }

        try {
            const bytes = new Uint8Array(await file.arrayBuffer());

            setInput(bytesToBsonText(bytes, options.bsonEncoding));
            setSource("bson");

            if (target === "bson") {
                setTarget("json");
            }

            toast.success(tToast("opened", { filename: file.name }));
        } catch (caught) {
            logEvent("error", "bson.file_read_failed", { error: describeError(caught) });
            toast.error(tToast("openFailed"));
        }
    }

    function reportCopyFailure(caught: Extract<CopyResult, { ok: false }>) {
        const message =
            caught.reason === "empty"
                ? tToast("copyFailedEmpty")
                : caught.reason === "unsupported"
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
        const exported = createTextExportFile(target, output, options.bsonEncoding);

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "bson.download_failed", { target, error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    function handleDownloadBytes() {
        if (!result.ok || result.bytes === null) {
            return;
        }

        const download = createBsonDownload(result.bytes);

        try {
            saveBlob(download);
            toast.success(tToast("downloaded", { filename: download.filename }));
        } catch (caught) {
            logEvent("error", "bson.download_failed", { target, error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const size = sizeSummary();

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
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormatPicker label={t("fromLabel")} value={source} onChange={selectSource} />
                    <FormatPicker label={t("toLabel")} value={target} onChange={selectTarget} />
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("inputLabel")}</span>
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <InputLimitMeter reading={inputLimit} className="mr-1" />

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => fileInput.current?.click()}
                            >
                                <IconFileUpload
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("openFile")}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleExample}>
                                <IconWand className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("example")}
                            </Button>
                            <button
                                type="button"
                                onClick={() => setInput("")}
                                disabled={input.length === 0}
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

                    <input
                        ref={fileInput}
                        type="file"
                        accept=".bson,application/bson,application/octet-stream"
                        className="sr-only"
                        onChange={(event) => {
                            void handleFile(event.target.files?.[0]);
                            // Cleared so re-picking the same file fires again.
                            event.target.value = "";
                        }}
                    />

                    <CodeEditor
                        id={inputId}
                        value={input}
                        language={inputLanguage}
                        placeholder={INPUT_PLACEHOLDERS[source]}
                        ariaDescribedBy={statusId}
                        onChange={setInput}
                        className="[&_textarea]:min-h-40"
                    />

                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        className="[&>span]:min-w-0 [&>span]:wrap-break-word"
                    />
                </div>

                <OptionsPanel
                    source={source}
                    target={target}
                    options={options}
                    onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
                />

                <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <button
                                    type="button"
                                    onClick={handleSwap}
                                    disabled={output.length === 0}
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

                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* A plain span, not a Label: the output is a `<pre>`,
                            which `htmlFor` cannot address. */}
                        <span className="text-muted-foreground text-xs leading-[1.3]">
                            {t("outputLabel")}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopy}
                                disabled={output.length === 0}
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
                                disabled={output.length === 0}
                            >
                                <IconDownload
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("download")}
                            </Button>
                            {result.ok && result.bytes !== null && (
                                <Button variant="outline" size="sm" onClick={handleDownloadBytes}>
                                    <IconBinary
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("downloadBytes")}
                                </Button>
                            )}
                        </div>
                    </div>

                    {failure === null ? (
                        // Dimmed rather than emptied while the debounce settles,
                        // so the panel never flashes between two valid results.
                        <CodeBlock
                            code={output}
                            language={outputLanguage}
                            placeholder={t("outputPlaceholder")}
                            pending={pending}
                            className="max-h-96 min-h-40"
                        />
                    ) : (
                        <p
                            role="alert"
                            className={cn(
                                "text-destructive ring-destructive/30 bg-destructive/8 flex min-h-40 items-start gap-2.5 rounded-xl p-3 text-[0.8125rem] leading-6 ring-1 ring-inset",
                                "transition-opacity duration-200",
                                pending && "opacity-55",
                            )}
                        >
                            <IconAlertTriangle
                                className="mt-0.5 size-4 shrink-0"
                                stroke={1.9}
                                aria-hidden="true"
                            />
                            {failure}
                        </p>
                    )}

                    {size !== null && (
                        <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.6875rem] leading-[1.4]">
                            <span className="font-mono tabular-nums">{size}</span>
                            <span className="text-muted-foreground/70">{t("sizeHint")}</span>
                        </p>
                    )}
                </div>

                {result.ok && <NotesList notes={result.notes} />}
            </CardContent>
        </Card>
    );
}
