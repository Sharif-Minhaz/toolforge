"use client";

import { IconDownload, IconExternalLink, IconFileTypePdf, IconLoader2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { MAX_PDF_SOURCE_BYTES, PDF_FONT_DIRECTORY, PDF_MIME_TYPE } from "../domain/constants";
import { coerceOptions, convertText, describeDocument } from "../domain/convert";
import { renderPdfBytes, type PdfRenderFailure } from "../domain/engine";
import { preparePdf } from "../domain/prepare";
import type {
    PdfConversionResult,
    PdfConverterOptions,
    PdfPasteableFormat,
    PdfSourceFormat,
} from "../types";
import { PdfOptions } from "./pdf-options";
import { ConversionNotes } from "./conversion-notes";
import { FilePicker, PastePanel } from "./source-picker";

/**
 * The one island.
 *
 * The pasted path derives its result **during render** from a pure function, so
 * the server-rendered pass already holds it and the first paint is not empty.
 * Unlike the HTML / Markdown converter there is no question here about which
 * parser a bundler hands to which environment: nothing in `convertText` touches
 * a DOM — the HTML parser is a pure tokeniser and Marked is a pure lexer — so
 * the server and the browser produce the same blocks from the same bytes.
 *
 * The file path cannot be, for two reasons that are both facts about files:
 * reading one is asynchronous, and the readers behind it are the largest thing
 * this page could download. So `convert-file.ts` is imported the first time a
 * file is picked, and its result is held in state.
 *
 * Producing the PDF itself is a **press**, never a keystroke. Laying out a
 * document is real work and re-doing it per character would make the panel feel
 * broken; the summary above the button updates live instead, so the reader
 * knows what they are about to get before they ask for it.
 */

/** The pack files are static assets on this origin, fetched by bare name. */
async function loadFontFile(filename: string): Promise<Uint8Array> {
    const response = await fetch(`${PDF_FONT_DIRECTORY}/${filename}`);

    if (!response.ok) {
        throw new Error(`font ${filename} responded ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
}

/**
 * How long a preview tab's object URL is kept alive.
 *
 * Revoking straight after `window.open` is what makes a preview open on a blank
 * page in Firefox; never revoking leaks the whole PDF until the tab closes.
 * A minute is far longer than a browser needs to read the blob and far shorter
 * than a session.
 */
const PREVIEW_URL_LIFETIME_MS = 60_000;

type Output = {
    readonly filename: string;
    readonly bytes: Uint8Array;
};

type PdfConverterWorkbenchProps = {
    initialFormat: PdfPasteableFormat;
    initialText: string;
    initialOptions: PdfConverterOptions;
    /** The conversion of `initialText`, already done on the server. */
    initialResult: PdfConversionResult;
};

export function PdfConverterWorkbench({
    initialFormat,
    initialText,
    initialOptions,
    initialResult,
}: PdfConverterWorkbenchProps) {
    const t = useTranslations("pdfConverter.workbench");
    const tErrors = useTranslations("pdfConverter.errors");
    const tFormats = useTranslations("pdfConverter.formats");
    const tToast = useTranslations("pdfConverter.toast");
    const byteLabel = useByteLabel();

    const sourceLabelId = useId();
    const { ref: resultRef, scrollToResult } = useResultScroll<HTMLDivElement>();

    const [source, setSource] = useState<"file" | "paste">("paste");
    const [pasteFormat, setPasteFormat] = useState<PdfPasteableFormat>(initialFormat);
    const [text, setText] = useState(initialText);
    const [file, setFile] = useState<File | null>(null);
    const [fileResult, setFileResult] = useState<PdfConversionResult | null>(null);
    const [reading, setReading] = useState(false);
    const [options, setOptions] = useState<PdfConverterOptions>(initialOptions);
    const [building, setBuilding] = useState(false);
    const [output, setOutput] = useState<Output | null>(null);
    const [renderFailure, setRenderFailure] = useState<PdfRenderFailure | null>(null);

    const previewTimers = useRef<number[]>([]);

    useEffect(
        () => () => {
            for (const timer of previewTimers.current) {
                window.clearTimeout(timer);
            }
        },
        [],
    );

    // Re-parsing on every keystroke would re-lex the whole document per
    // character. The typed value settles first; every other control here is a
    // single event and takes effect at once.
    const settledText = useDebouncedValue(text);
    const pending = settledText !== text;

    const format: PdfSourceFormat =
        source === "file"
            ? fileResult?.ok === true
                ? fileResult.format
                : pasteFormat
            : pasteFormat;

    // Coerced rather than merely hidden: a control the format cannot use must
    // not reach the renderer with a value the panel is not showing.
    const effective = coerceOptions(options, format, initialOptions);

    const pasteResult =
        settledText === initialText && source === "paste"
            ? initialResult
            : convertText({ format: pasteFormat, text: settledText, options: effective });

    const result = source === "file" ? fileResult : pasteResult;

    const inputProblem =
        result !== null && !result.ok && isInputProblem(result.reason) ? result : null;
    const documentProblem =
        result !== null && !result.ok && !isInputProblem(result.reason) ? result : null;

    const summary = result?.ok === true ? describeDocument(result.document) : null;

    function describeFailure(failed: Extract<PdfConversionResult, { ok: false }>): string {
        if (failed.reason === "too_large") {
            return tErrors("too_large", { limit: byteLabel(MAX_PDF_SOURCE_BYTES) });
        }

        if (failed.reason === "wrong_package") {
            return tErrors("wrong_package", {
                actual: tFormats(failed.actualFormat ?? "docx"),
            });
        }

        return tErrors(failed.reason);
    }

    function forget() {
        setOutput(null);
        setRenderFailure(null);
    }

    async function handleFile(picked: File) {
        setFile(picked);
        forget();

        if (picked.size > MAX_PDF_SOURCE_BYTES) {
            setFileResult({ ok: false, reason: "too_large" });

            return;
        }

        setReading(true);

        try {
            // Imported here rather than at the top: Mammoth, the XML parser and
            // the unzipper together are larger than the rest of this page, and
            // a reader who only pastes Markdown never needs any of them.
            const [{ convertFile }, buffer] = await Promise.all([
                import("../domain/convert-file"),
                picked.arrayBuffer(),
            ]);

            setFileResult(
                await convertFile({
                    filename: picked.name,
                    bytes: new Uint8Array(buffer),
                    options: effective,
                }),
            );
            toast.success(tToast("fileLoaded", { name: picked.name }));
        } catch (caught) {
            logEvent("error", "pdf_converter.file_read_failed", { error: describeError(caught) });
            setFileResult({ ok: false, reason: "malformed_source" });
        } finally {
            setReading(false);
        }
    }

    function handleClearFile() {
        setFile(null);
        setFileResult(null);
        forget();
    }

    async function handleConvert() {
        if (result === null || !result.ok) {
            return;
        }

        setBuilding(true);
        setRenderFailure(null);

        try {
            const prepared = preparePdf({
                document: result.document,
                options: effective,
                sourceFilename: source === "file" ? (file?.name ?? null) : null,
                // The clock is read at the press rather than during render, so
                // nothing here differs between the server pass and the browser.
                generatedAt: new Date(),
                labels: {
                    speakerNotes: (slideNumber) => t("notesLabel", { number: slideNumber }),
                },
            });

            const rendered = await renderPdfBytes(prepared, loadFontFile);

            if (!rendered.ok) {
                logEvent("warn", "pdf_converter.render_refused", { reason: rendered.reason });
                setRenderFailure(rendered.reason);

                return;
            }

            setOutput({ filename: prepared.filename, bytes: rendered.bytes });
            toast.success(tToast("converted", { size: byteLabel(rendered.bytes.length) }));
            scrollToResult();
        } catch (caught) {
            logEvent("error", "pdf_converter.render_failed", { error: describeError(caught) });
            setRenderFailure("engine_failed");
        } finally {
            setBuilding(false);
        }
    }

    function toBlob(bytes: Uint8Array): Blob {
        return new Blob([new Uint8Array(bytes)], { type: PDF_MIME_TYPE });
    }

    function handleDownload() {
        if (output === null) {
            return;
        }

        try {
            saveBlob({ filename: output.filename, blob: toBlob(output.bytes) });
            toast.success(tToast("downloaded", { filename: output.filename }));
        } catch (caught) {
            logEvent("error", "pdf_converter.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    function handlePreview() {
        if (output === null) {
            return;
        }

        const url = URL.createObjectURL(toBlob(output.bytes));
        const opened = window.open(url, "_blank", "noopener,noreferrer");

        if (opened === null) {
            URL.revokeObjectURL(url);
            toast.error(tToast("previewBlocked"));

            return;
        }

        previewTimers.current.push(
            window.setTimeout(() => URL.revokeObjectURL(url), PREVIEW_URL_LIFETIME_MS),
        );
    }

    const convertible = result?.ok === true && !building && !reading;

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
                    <span id={sourceLabelId} className="text-muted-foreground text-xs">
                        {t("sourceLabel")}
                    </span>
                    <div
                        role="radiogroup"
                        aria-labelledby={sourceLabelId}
                        className="bg-muted/50 ring-border/70 inline-flex w-fit gap-1 rounded-xl p-1 ring-1 ring-inset"
                    >
                        {(["file", "paste"] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={source === value}
                                onClick={() => {
                                    setSource(value);
                                    forget();
                                }}
                                className={cn(
                                    "focus-visible:ring-ring rounded-lg px-3.5 py-1.5 text-[0.8125rem] leading-[1.3] font-medium",
                                    "transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none",
                                    source === value
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {t(`sources.${value}`)}
                            </button>
                        ))}
                    </div>
                </div>

                {source === "file" ? (
                    <FilePicker
                        file={file}
                        reading={reading}
                        error={inputProblem === null ? null : describeFailure(inputProblem)}
                        onFile={handleFile}
                        onClear={handleClearFile}
                    />
                ) : (
                    <PastePanel
                        format={pasteFormat}
                        text={text}
                        error={inputProblem === null ? null : describeFailure(inputProblem)}
                        onFormatChange={(next) => {
                            setPasteFormat(next);
                            forget();
                        }}
                        onTextChange={(next) => {
                            setText(next);
                            forget();
                        }}
                        onClear={() => {
                            setText("");
                            forget();
                        }}
                    />
                )}

                <Separator />

                <PdfOptions
                    format={format}
                    options={effective}
                    onChange={(patch) => {
                        setOptions((current) => ({ ...current, ...patch }));
                        forget();
                    }}
                />

                <Separator />

                <section
                    className={cn(
                        "flex flex-col gap-3 transition-opacity duration-200",
                        pending && "opacity-55",
                    )}
                    aria-label={t("summaryTitle")}
                >
                    {summary === null ? (
                        <div className="flex flex-col gap-1">
                            <p className="text-[0.9375rem] leading-[1.4] font-medium">
                                {documentProblem === null ? t("emptyTitle") : t("summaryTitle")}
                            </p>
                            <p className="text-muted-foreground text-xs leading-[1.5]">
                                {documentProblem === null
                                    ? t("emptyDescription")
                                    : describeFailure(documentProblem)}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <p className="text-muted-foreground text-xs">{t("summaryTitle")}</p>
                            <ul className="flex flex-wrap items-center gap-1.5">
                                {[
                                    summary.layout === "slides"
                                        ? t("summarySlides", { count: summary.units })
                                        : t("summaryBlocks", { count: summary.units }),
                                    t("summaryWords", { count: summary.words }),
                                    ...(summary.tables > 0
                                        ? [t("summaryTables", { count: summary.tables })]
                                        : []),
                                    ...(summary.images > 0
                                        ? [t("summaryImages", { count: summary.images })]
                                        : []),
                                ].map((label) => (
                                    <li
                                        key={label}
                                        className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
                                    >
                                        {label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {result?.ok === true && <ConversionNotes notes={result.notes} />}

                    {renderFailure !== null && (
                        <StatusStrip
                            tone="error"
                            message={tErrors(
                                renderFailure === "font_unavailable"
                                    ? "fontUnavailable"
                                    : "engineFailed",
                            )}
                        />
                    )}
                </section>

                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleConvert} disabled={!convertible}>
                        {building ? (
                            <IconLoader2
                                className="size-4 animate-spin"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                        ) : (
                            <IconFileTypePdf className="size-4" stroke={1.8} aria-hidden="true" />
                        )}
                        {building ? t("converting") : t("convert")}
                    </Button>
                </div>

                {output !== null && (
                    <div
                        ref={resultRef}
                        className="bg-card/60 ring-border/70 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1 ring-inset"
                    >
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <p className="text-muted-foreground text-xs">{t("resultTitle")}</p>
                            <p className="truncate text-[0.9375rem] leading-[1.4] font-medium">
                                {output.filename}
                            </p>
                            <p className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                                {byteLabel(output.bytes.length)}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" onClick={handlePreview}>
                                <IconExternalLink
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("openPreview")}
                            </Button>
                            <Button size="sm" onClick={handleDownload}>
                                <IconDownload
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("download")}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * Whether a refusal is about what was handed in or about what came out of it.
 *
 * The first belongs beside the input; the second belongs where the answer would
 * have been. `CLAUDE.md` rule 29, and the split is worth keeping honest: "that
 * file is a spreadsheet" is a complaint about the pick, while "nothing readable
 * came out" is a complaint about the conversion.
 */
function isInputProblem(reason: Extract<PdfConversionResult, { ok: false }>["reason"]): boolean {
    return (
        reason === "too_large" ||
        reason === "unknown_format" ||
        reason === "legacy_office_format" ||
        reason === "not_a_package" ||
        reason === "wrong_package"
    );
}
