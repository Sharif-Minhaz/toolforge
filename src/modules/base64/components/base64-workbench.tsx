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
import { getCharsetLabel, isEncodable, type CharsetId } from "../domain/charsets";
import {
    DEFAULT_CHARSET,
    DEFAULT_CONVERSION_OPTIONS,
    DEFAULT_DATA_URI_MIME_TYPE,
    MAX_BASE64_INPUT_BYTES,
} from "../domain/constants";
import { convert, type Base64ConversionResult } from "../domain/convert";
import { createBase64ExportFile } from "../domain/export";
import type { Base64Alphabet, Base64ConversionOptions, Base64Mode, Base64Source } from "../types";
import { ConversionOptions } from "./conversion-options";
import { InputPanel, type LoadedFile } from "./input-panel";
import { ModeSelector } from "./mode-selector";
import { OutputPanel } from "./output-panel";

type Base64WorkbenchProps = {
    initialMode: Base64Mode;
    initialText: string;
    initialAlphabet: Base64Alphabet;
    initialCharset: CharsetId;
};

export function Base64Workbench({
    initialMode,
    initialText,
    initialAlphabet,
    initialCharset,
}: Base64WorkbenchProps) {
    const t = useTranslations("base64.workbench");
    const tToast = useTranslations("base64.toast");
    const tErrors = useTranslations("base64.errors");
    const byteLabel = useByteLabel();

    const modeLabelId = useId();
    const inputId = useId();
    const outputId = useId();

    const [mode, setMode] = useState<Base64Mode>(initialMode);
    const [text, setText] = useState(initialText);
    const [file, setFile] = useState<LoadedFile | null>(null);
    const [options, setOptions] = useState<Base64ConversionOptions>({
        ...DEFAULT_CONVERSION_OPTIONS,
        alphabet: initialAlphabet,
        charset: initialCharset,
    });

    function describeFailure(failure: Extract<Base64ConversionResult, { ok: false }>): string {
        const charset = getCharsetLabel(options.charset);

        const message = (() => {
            switch (failure.reason) {
                case "invalid_character":
                    return failure.position === undefined
                        ? tErrors("invalidBase64")
                        : tErrors("invalidCharacter", { position: failure.position });
                case "invalid_length":
                    return tErrors("invalidLength");
                case "undecodable_text":
                    return tErrors("undecodableText", { charset });
                case "unencodable_character":
                    return failure.position === undefined
                        ? tErrors("unencodableCharset", { charset })
                        : tErrors("unencodableCharacter", {
                              position: failure.position,
                              charset,
                          });
                case "unsupported_charset":
                    return tErrors("unsupportedCharset", { charset });
                case "too_large":
                    return tErrors("tooLarge", { limit: byteLabel(MAX_BASE64_INPUT_BYTES) });
            }
        })();

        return failure.line === undefined
            ? message
            : tErrors("onLine", { line: failure.line, message });
    }

    function updateOptions(patch: Partial<Base64ConversionOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    function handleModeChange(next: Base64Mode) {
        setMode(next);

        // Decode offers sets that cannot be written, so carrying one into the
        // encode direction would leave the picker on a value it no longer
        // lists. UTF-8 is the safe landing spot.
        if (next === "encode" && !isEncodable(options.charset)) {
            updateOptions({ charset: DEFAULT_CHARSET });
        }
    }

    // Converting on every keystroke would re-encode the whole buffer for each
    // character, which a low-powered device feels immediately. The typed value
    // settles first; a file, being a single event, converts straight away.
    const settledText = useDebouncedValue(text);
    const pending = settledText !== text;

    const source: Base64Source = file
        ? { kind: "file", name: file.name, mimeType: file.mimeType, bytes: file.bytes }
        : { kind: "text", text: settledText };

    // Pure and deterministic, so the server-rendered pass already carries the
    // result and hydration has nothing to reconcile.
    const result = convert({ mode, source, options });
    // Falls back to a UTF-8 measure only when the conversion failed and the
    // real figure is unknown.
    const inputBytes = result.ok
        ? result.inputBytes
        : file
          ? file.bytes.length
          : getByteLength(settledText);
    const output = result.ok ? result.output : "";
    const error = result.ok ? null : describeFailure(result);
    const swappable = result.ok && result.output.length > 0;

    function handleClear() {
        setText("");
        setFile(null);
    }

    async function handleFileSelect(selected: File) {
        if (selected.size > MAX_BASE64_INPUT_BYTES) {
            toast.error(
                tErrors("fileTooLarge", {
                    name: selected.name,
                    limit: byteLabel(MAX_BASE64_INPUT_BYTES),
                }),
            );

            return;
        }

        try {
            const buffer = await selected.arrayBuffer();

            setFile({
                name: selected.name,
                mimeType: selected.type || DEFAULT_DATA_URI_MIME_TYPE,
                bytes: new Uint8Array(buffer),
            });
            toast.success(tToast("fileLoaded", { name: selected.name }));
        } catch (caught) {
            logEvent("error", "base64.file_read_failed", { error: describeError(caught) });
            toast.error(tErrors("fileUnreadable"));
        }
    }

    /** Feeds the result back in as input, so encode → decode is one click. */
    function handleSwap() {
        if (!swappable) {
            return;
        }

        setText(output);
        setFile(null);
        setMode(mode === "encode" ? "decode" : "encode");
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
        const exported = createBase64ExportFile({ mode, content: output, generatedAt: new Date() });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "base64.download_failed", { mode, error: describeError(caught) });
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
                    file={file}
                    inputId={inputId}
                    inputBytes={inputBytes}
                    onTextChange={setText}
                    onFileSelect={handleFileSelect}
                    onClear={handleClear}
                />

                <ConversionOptions
                    mode={mode}
                    options={options}
                    fileSource={file !== null}
                    onChange={updateOptions}
                />

                {mode === "decode" && (
                    <p className="text-muted-foreground text-xs leading-relaxed">
                        {t("decodeHint")}
                    </p>
                )}

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
                    outputId={outputId}
                    output={output}
                    outputBytes={result.ok ? result.outputBytes : 0}
                    error={error}
                    pending={pending}
                    onCopy={handleCopy}
                    onDownload={handleDownload}
                />
            </CardContent>
        </Card>
    );
}
