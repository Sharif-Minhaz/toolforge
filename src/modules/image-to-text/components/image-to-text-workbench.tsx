"use client";

import { IconCloudDownload, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { ImageDropzone } from "@/modules/tools/components/image-dropzone";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { ToolNotes } from "@/modules/tools/components/tool-notes";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { copyText } from "@/modules/tools/domain/clipboard";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import { IMAGE_ACCEPT_ATTRIBUTE, IMAGE_FILE_LIMITS, MAX_IMAGE_BYTES } from "../domain/constants";
import {
    firstRunBytes,
    isRightToLeft,
    LANGUAGE_ENDONYMS,
    LANGUAGE_TAGS,
} from "../domain/languages";
import { recognizeImage } from "../domain/recognize";
import { countText } from "../domain/text";
import {
    OCR_LANGUAGES,
    type OcrFailure,
    type OcrLanguage,
    type OcrProgress,
    type OcrResult,
} from "../types";

type PickedImage = {
    readonly file: File;
    readonly previewUrl: string;
};

/** What the box holds, and which language it was read in — that decides its direction. */
type ReadText = {
    readonly language: OcrLanguage;
    readonly text: string;
};

type ImageToTextWorkbenchProps = {
    /** From the `lang` search param or the locale, decided on the server. */
    initialLanguage: OcrLanguage;
    /** Whether this deployment can fetch a picture by its address at all. */
    urlImportEnabled: boolean;
};

export function ImageToTextWorkbench({
    initialLanguage,
    urlImportEnabled,
}: ImageToTextWorkbenchProps) {
    const t = useTranslations("imageToText.workbench");
    const tLanguages = useTranslations("imageToText.languages");
    const tErrors = useTranslations("imageToText.errors");
    const tToast = useTranslations("imageToText.toast");
    const format = useFormatter();
    const byteLabel = useByteLabel();
    const [copied, markCopied] = useCopyFeedback<"text">();
    const { ref: resultRef, scrollToResult } = useResultScroll();

    const inputId = useId();
    const statusId = useId();
    const resultId = useId();
    const countsId = useId();

    const [language, setLanguage] = useState<OcrLanguage>(initialLanguage);
    const [picked, setPicked] = useState<PickedImage | null>(null);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<OcrProgress | null>(null);
    const [failure, setFailure] = useState<OcrFailure | null>(null);
    const [read, setRead] = useState<ReadText | null>(null);

    // Held outside state so a new pick, Clear and unmount can all stop the
    // run in flight, and so its late answer is recognised as stale.
    const runRef = useRef<AbortController | null>(null);
    const previewRef = useRef<string | null>(null);

    useEffect(
        () => () => {
            runRef.current?.abort();

            if (previewRef.current !== null) {
                URL.revokeObjectURL(previewRef.current);
            }
        },
        [],
    );

    function languageLabel(code: OcrLanguage): string {
        const name = tLanguages(code);
        const endonym = LANGUAGE_ENDONYMS[code];

        return name === endonym ? name : t("languageOption", { name, endonym });
    }

    function describeFailure(reason: OcrFailure["reason"]): string {
        return reason === "too_large"
            ? tErrors("too_large", { limit: byteLabel(MAX_IMAGE_BYTES) })
            : tErrors(reason);
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (running) {
            if (progress === null) {
                return { tone: "pending", message: t("statusPreparing") };
            }

            const percent = format.number(progress.ratio, {
                style: "percent",
                maximumFractionDigits: 0,
            });

            return {
                tone: "pending",
                message:
                    progress.phase === "recognizing"
                        ? t("statusRecognizing", { percent })
                        : t("statusLoading", { percent }),
            };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure.reason) };
        }

        if (read === null) {
            return { tone: "idle", message: t("statusPick") };
        }

        return read.text.length === 0
            ? { tone: "warning", message: t("statusEmpty") }
            : { tone: "success", message: t("statusDone") };
    }

    function stopRun() {
        runRef.current?.abort();
        runRef.current = null;
        setRunning(false);
        setProgress(null);
    }

    async function runRead(file: File, readLanguage: OcrLanguage) {
        runRef.current?.abort();

        const run = new AbortController();

        runRef.current = run;
        setRunning(true);
        setProgress(null);
        setFailure(null);

        const result: OcrResult = await recognizeImage(file, readLanguage, {
            signal: run.signal,
            onProgress: (next) => {
                if (!run.signal.aborted) {
                    setProgress(next);
                }
            },
        }).catch((caught: unknown): OcrResult => ({
            ok: false,
            reason: "recognition_failed",
            detail: describeError(caught),
        }));

        // A newer pick, Clear or unmount has taken over; this answer is stale.
        if (run.signal.aborted) {
            return;
        }

        runRef.current = null;
        setRunning(false);
        setProgress(null);

        if (!result.ok) {
            logEvent("warn", "image_to_text.read_failed", {
                reason: result.reason,
                detail: result.detail ?? null,
            });
            setFailure(result);

            return;
        }

        setRead({ language: readLanguage, text: result.text });
        scrollToResult();
    }

    function replacePreview(next: PickedImage | null) {
        if (previewRef.current !== null) {
            URL.revokeObjectURL(previewRef.current);
        }

        previewRef.current = next?.previewUrl ?? null;
        setPicked(next);
    }

    function handleFiles(files: readonly File[]) {
        const file = files[0];

        if (file === undefined) {
            return;
        }

        const check = checkImageFile(file, IMAGE_FILE_LIMITS);

        if (!check.ok) {
            stopRun();
            setFailure({ ok: false, reason: check.reason });

            return;
        }

        // The box belonged to the previous picture; keeping it would pair
        // that text with this one.
        setRead(null);
        replacePreview({ file, previewUrl: URL.createObjectURL(file) });
        void runRead(file, language);
    }

    function handleClear() {
        stopRun();
        replacePreview(null);
        setRead(null);
        setFailure(null);
    }

    async function handleCopy(value: string) {
        const result = await copyText(value);

        if (result.ok) {
            markCopied("text");
            toast.success(tToast("copied"));

            return;
        }

        logEvent("error", "image_to_text.copy_failed", { reason: result.reason });
        toast.error(tToast("copyFailed"));
    }

    const status = describeStatus();
    // Counted on every keystroke, undebounced: it is a walk over text already
    // in memory, and a count that lags the box reads as wrong.
    const counts = read === null ? null : countText(read.text);

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

            <CardContent className="flex min-w-0 flex-col gap-5">
                {/* Above the controls, not in the article: the one thing that
                    leaves this tab is the engine coming in, and a reader
                    should know before they press anything. */}
                <ToolNotes
                    notes={[
                        {
                            key: "download",
                            icon: IconCloudDownload,
                            tone: "muted",
                            title: t("downloadTitle"),
                            body: t("downloadNote", {
                                language: tLanguages(language),
                                size: byteLabel(firstRunBytes(language)),
                            }),
                        },
                    ]}
                />

                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <OptionSelect<OcrLanguage>
                        label={t("languageLabel")}
                        hint={t("languageHint")}
                        value={language}
                        values={OCR_LANGUAGES}
                        disabled={running}
                        items={Object.fromEntries(
                            OCR_LANGUAGES.map((code) => [code, languageLabel(code)]),
                        )}
                        onChange={setLanguage}
                    />
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    <ImageDropzone
                        inputId={inputId}
                        title={t("dropTitle")}
                        hint={t("dropHint", { limit: byteLabel(MAX_IMAGE_BYTES) })}
                        accept={IMAGE_ACCEPT_ATTRIBUTE}
                        describedById={statusId}
                        onFiles={handleFiles}
                    />

                    <ImageSourceControls
                        onFiles={handleFiles}
                        urlImportEnabled={urlImportEnabled}
                    />

                    <StatusStrip id={statusId} tone={status.tone} message={status.message} />
                </div>

                {picked !== null && (
                    <div className="bg-card/60 ring-border/70 flex min-w-0 flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                        {/* A plain `<img>`, deliberately: the source is an
                            object URL for a file in this tab, which the image
                            optimiser can neither fetch nor improve. */}
                        <img
                            src={picked.previewUrl}
                            alt={t("previewAlt")}
                            decoding="async"
                            className="ring-border/70 size-12 shrink-0 rounded-lg object-cover ring-1"
                        />
                        <span className="min-w-0 flex-1 truncate text-[0.8125rem] leading-[1.4] font-medium">
                            {picked.file.name}
                        </span>
                        <div className="flex shrink-0 gap-2">
                            <Button
                                variant="outline"
                                onClick={() => void runRead(picked.file, language)}
                                disabled={running}
                                className="h-8 px-2.5"
                            >
                                <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
                                {t("readAgain")}
                            </Button>
                            <Button variant="outline" onClick={handleClear} className="h-8 px-2.5">
                                <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                                {t("clear")}
                            </Button>
                        </div>
                    </div>
                )}

                {read !== null && counts !== null && (
                    <div ref={resultRef} className="flex min-w-0 scroll-mt-24 flex-col gap-2">
                        <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <label
                                    htmlFor={resultId}
                                    className="text-[0.8125rem] leading-[1.3] font-medium"
                                >
                                    {t("resultLabel")}
                                </label>
                                <span
                                    id={countsId}
                                    className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                                >
                                    {t("counts", counts)}
                                </span>
                            </div>
                            <Button
                                onClick={() => void handleCopy(read.text)}
                                disabled={read.text.length === 0}
                                className="h-8 px-3"
                            >
                                <CopyIconSwap copied={copied === "text"} />
                                {t("copy")}
                            </Button>
                        </div>

                        {/* No ceiling and no meter: nothing here is submitted
                            or derived from, and the box starts at whatever the
                            engine read off one picture. */}
                        <Textarea
                            id={resultId}
                            value={read.text}
                            lang={LANGUAGE_TAGS[read.language]}
                            dir={isRightToLeft(read.language) ? "rtl" : "ltr"}
                            spellCheck={false}
                            aria-describedby={countsId}
                            placeholder={t("resultPlaceholder")}
                            onChange={(event) =>
                                setRead({ language: read.language, text: event.target.value })
                            }
                            className={cn(
                                "max-h-[36rem] min-h-56 text-[0.9375rem] leading-7 transition-opacity duration-200",
                                running && "opacity-55",
                            )}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
