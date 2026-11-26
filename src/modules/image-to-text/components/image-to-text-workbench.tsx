"use client";

import { IconRefresh, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageDropzone } from "@/modules/tools/components/image-dropzone";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { OnlineRequiredNote } from "@/modules/tools/components/online-required-note";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import {
    OptionsDisclosure,
    RESULT_TRAY,
    StepLabel,
} from "@/modules/tools/components/workbench-step";
import { copyText } from "@/modules/tools/domain/clipboard";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import {
    DEFAULT_RESULT_LAYOUT,
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FILE_LIMITS,
    MAX_IMAGE_BYTES,
    MAX_IMAGES,
} from "../domain/constants";
import { readFetchedLanguages } from "../domain/language-memory";
import { LANGUAGE_ENDONYMS } from "../domain/languages";
import { recognizeImages } from "../domain/recognize";
import { appendTextSection, combineTexts, countText, type TextSection } from "../domain/text";
import {
    OCR_LANGUAGES,
    RESULT_LAYOUTS,
    type ImageRejectionReason,
    type OcrFailure,
    type OcrFailureReason,
    type OcrLanguage,
    type OcrProgress,
    type ResultLayout,
} from "../types";
import { ResultTextBox } from "./result-text-box";

type ImageStatus =
    | { readonly kind: "queued" }
    | { readonly kind: "reading"; readonly progress: OcrProgress | null }
    | { readonly kind: "done"; readonly characters: number }
    | { readonly kind: "failed"; readonly reason: OcrFailureReason };

type PickedImage = {
    /** Bumped per pick, so React keys stay unique for two files with one name. */
    readonly id: number;
    readonly file: File;
    readonly previewUrl: string;
    readonly status: ImageStatus;
    /** This picture's own box: what was read, then whatever the reader made of it. */
    readonly read: { readonly language: OcrLanguage; readonly text: string } | null;
};

type Rejection = {
    readonly name: string;
    readonly reason: ImageRejectionReason;
};

type ImageToTextWorkbenchProps = {
    /** From the `lang` search param or the locale, decided on the server. */
    initialLanguage: OcrLanguage;
    /** Whether this deployment can fetch a picture by its address at all. */
    urlImportEnabled: boolean;
};

const COMBINED_COPY_KEY = "combined";

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
    const [copied, markCopied] = useCopyFeedback<string>();
    const { ref: resultRef, scrollToResult } = useResultScroll();

    const inputId = useId();
    const statusId = useId();
    const picturesId = useId();

    const [language, setLanguage] = useState<OcrLanguage>(initialLanguage);
    const online = useOnline();
    const [layout, setLayout] = useState<ResultLayout>(DEFAULT_RESULT_LAYOUT);
    const [images, setImages] = useState<readonly PickedImage[]>([]);
    const [rejections, setRejections] = useState<readonly Rejection[]>([]);
    const [running, setRunning] = useState(false);
    const [batchFailure, setBatchFailure] = useState<OcrFailure | null>(null);
    // The combined box shows every picture's box joined until the reader types
    // in it; after that it is theirs, and a newly read picture is appended
    // rather than rebuilding it over their edits.
    const [combinedEdited, setCombinedEdited] = useState<string | null>(null);
    const [readLanguage, setReadLanguage] = useState<OcrLanguage | null>(null);

    const nextId = useRef(0);
    // Held outside state so Clear and unmount can stop the run in flight, and
    // so its late answers are recognised as stale.
    const runRef = useRef<AbortController | null>(null);
    // Held outside state so the unmount cleanup sees every URL ever handed out.
    const previewUrls = useRef(new Set<string>());

    useEffect(() => {
        const urls = previewUrls.current;

        return () => {
            runRef.current?.abort();

            for (const url of urls) {
                URL.revokeObjectURL(url);
            }

            urls.clear();
        };
    }, []);

    const sections: TextSection[] = images.flatMap((image, index) =>
        image.read === null
            ? []
            : [{ position: index + 1, name: image.file.name, text: image.read.text }],
    );
    const combinedText = combinedEdited ?? combineTexts(sections);

    function languageLabel(code: OcrLanguage): string {
        const name = tLanguages(code);
        const endonym = LANGUAGE_ENDONYMS[code];

        return name === endonym ? name : t("languageOption", { name, endonym });
    }

    function percentOf(progress: OcrProgress): string {
        return format.number(progress.ratio, { style: "percent", maximumFractionDigits: 0 });
    }

    function describeFailure(reason: ImageRejectionReason | OcrFailureReason): string {
        switch (reason) {
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_IMAGE_BYTES) });
            case "too_many":
                return tErrors("too_many", { limit: MAX_IMAGES });
            default:
                return tErrors(reason);
        }
    }

    function describeImage(status: ImageStatus): { tone: StatusTone; message: string } {
        switch (status.kind) {
            case "queued":
                return { tone: "idle", message: t("imageQueued") };
            case "reading":
                if (status.progress === null) {
                    return { tone: "pending", message: t("statusPreparing") };
                }

                return {
                    tone: "pending",
                    message:
                        status.progress.phase === "loading"
                            ? t("statusLoading", { percent: percentOf(status.progress) })
                            : t("imageReading", { percent: percentOf(status.progress) }),
                };
            case "done":
                return status.characters === 0
                    ? { tone: "warning", message: t("imageEmpty") }
                    : {
                          tone: "success",
                          message: t("imageDone", { characters: status.characters }),
                      };
            case "failed":
                return { tone: "error", message: describeFailure(status.reason) };
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (running) {
            const index = images.findIndex((image) => image.status.kind === "reading");
            const status = images[index]?.status;

            if (status?.kind !== "reading" || status.progress === null) {
                return { tone: "pending", message: t("statusPreparing") };
            }

            const percent = percentOf(status.progress);

            return {
                tone: "pending",
                message:
                    status.progress.phase === "loading"
                        ? t("statusLoading", { percent })
                        : t("statusRecognizing", {
                              current: index + 1,
                              total: images.length,
                              percent,
                          }),
            };
        }

        if (batchFailure !== null) {
            return { tone: "error", message: describeFailure(batchFailure.reason) };
        }

        if (images.length === 0) {
            return { tone: "idle", message: t("statusPick") };
        }

        const failed = images.filter((image) => image.status.kind === "failed").length;

        if (failed > 0) {
            return {
                tone: "warning",
                message: t("statusPartial", { failed, total: images.length }),
            };
        }

        const empty = images.every(
            (image) => image.status.kind === "done" && image.status.characters === 0,
        );

        return empty
            ? { tone: "warning", message: t("statusEmpty") }
            : { tone: "success", message: t("statusDone") };
    }

    function patchImage(id: number | undefined, patch: Partial<Omit<PickedImage, "id">>) {
        setImages((list) =>
            list.map((image) => (image.id === id ? { ...image, ...patch } : image)),
        );
    }

    /** `offset` is how many pictures precede the batch, so headings number the whole page. */
    async function readBatch(
        batch: readonly PickedImage[],
        offset: number,
        batchLanguage: OcrLanguage,
    ) {
        runRef.current?.abort();

        const run = new AbortController();

        runRef.current = run;
        setRunning(true);
        setBatchFailure(null);
        setReadLanguage(batchLanguage);

        const failure = await recognizeImages(
            batch.map((image) => image.file),
            batchLanguage,
            {
                signal: run.signal,
                onProgress: (index, progress) => {
                    if (!run.signal.aborted) {
                        patchImage(batch[index]?.id, { status: { kind: "reading", progress } });
                    }
                },
                onResult: (index, result) => {
                    const image = batch[index];

                    if (run.signal.aborted || image === undefined) {
                        return;
                    }

                    if (!result.ok) {
                        logEvent("warn", "image_to_text.read_failed", {
                            reason: result.reason,
                            detail: result.detail ?? null,
                        });
                        patchImage(image.id, { status: { kind: "failed", reason: result.reason } });

                        return;
                    }

                    const section = {
                        position: offset + index + 1,
                        name: image.file.name,
                        text: result.text,
                    };

                    patchImage(image.id, {
                        status: { kind: "done", characters: countText(result.text).characters },
                        read: { language: batchLanguage, text: result.text },
                    });
                    setCombinedEdited((current) =>
                        current === null ? null : appendTextSection(current, section),
                    );
                },
            },
        ).catch((caught: unknown): OcrFailure => ({
            ok: false,
            reason: "recognition_failed",
            detail: describeError(caught),
        }));

        // Clear or unmount has taken over; whatever this run says is stale.
        if (run.signal.aborted) {
            return;
        }

        runRef.current = null;
        setRunning(false);

        if (failure !== null) {
            logEvent("warn", "image_to_text.batch_failed", {
                reason: failure.reason,
                detail: failure.detail ?? null,
            });

            // The engine never got to these; they share its reason.
            const inBatch = new Set(batch.map((image) => image.id));

            setImages((list) =>
                list.map((image) =>
                    inBatch.has(image.id) &&
                    (image.status.kind === "queued" || image.status.kind === "reading")
                        ? { ...image, status: { kind: "failed", reason: failure.reason } }
                        : image,
                ),
            );
            setBatchFailure(failure);
        }

        scrollToResult();
    }

    function handleFiles(files: readonly File[]) {
        if (running || files.length === 0) {
            return;
        }

        const accepted: PickedImage[] = [];
        const turnedAway: Rejection[] = [];

        for (const file of files) {
            const check = checkImageFile(file, IMAGE_FILE_LIMITS);

            if (!check.ok) {
                turnedAway.push({ name: file.name, reason: check.reason });
            } else if (images.length + accepted.length >= MAX_IMAGES) {
                turnedAway.push({ name: file.name, reason: "too_many" });
            } else {
                const previewUrl = URL.createObjectURL(file);

                previewUrls.current.add(previewUrl);
                accepted.push({
                    id: (nextId.current += 1),
                    file,
                    previewUrl,
                    status: { kind: "queued" },
                    read: null,
                });
            }
        }

        setRejections(turnedAway);

        if (accepted.length === 0) {
            return;
        }

        setImages((list) => [...list, ...accepted]);
        void readBatch(accepted, images.length, language);
    }

    function handleReadAgain() {
        const queued = images.map((image) => ({
            ...image,
            status: { kind: "queued" } as const,
            read: null,
        }));

        setImages(queued);
        setCombinedEdited(null);
        setRejections([]);
        void readBatch(queued, 0, language);
    }

    function handleClear() {
        runRef.current?.abort();
        runRef.current = null;

        for (const url of previewUrls.current) {
            URL.revokeObjectURL(url);
        }

        previewUrls.current.clear();
        setRunning(false);
        setImages([]);
        setRejections([]);
        setCombinedEdited(null);
        setBatchFailure(null);
        setReadLanguage(null);
    }

    async function handleCopy(key: string, value: string) {
        const result = await copyText(value);

        if (result.ok) {
            markCopied(key);
            toast.success(tToast("copied"));

            return;
        }

        logEvent("error", "image_to_text.copy_failed", { reason: result.reason });
        toast.error(tToast("copyFailed"));
    }

    function renderPicture(image: PickedImage, index: number) {
        const imageStatus = describeImage(image.status);

        return (
            <figure className="flex min-w-0 flex-col gap-2">
                {/* A plain `<img>`, deliberately: the source is an object URL
                    for a file in this tab, which the image optimiser can
                    neither fetch nor improve. Shown large and uncropped, so the
                    reader can check the text against the picture. */}
                <img
                    src={image.previewUrl}
                    alt={t("previewAlt", { position: index + 1, name: image.file.name })}
                    decoding="async"
                    className="bg-muted/40 max-h-[32rem] w-full rounded-lg object-contain"
                />
                <figcaption className="flex min-w-0 flex-col gap-0.5 px-1 pb-1">
                    <span className="truncate text-[0.8125rem] leading-[1.4] font-medium">
                        {index + 1}. {image.file.name}
                    </span>
                    <StatusStrip tone={imageStatus.tone} message={imageStatus.message} />
                </figcaption>
            </figure>
        );
    }

    function renderItemBox(image: PickedImage, index: number) {
        const key = `image-${image.id}`;
        const read = image.read;

        return (
            <ResultTextBox
                label={t("itemLabel", { position: index + 1 })}
                text={read?.text ?? ""}
                language={read?.language ?? language}
                placeholder={
                    image.status.kind === "failed"
                        ? describeFailure(image.status.reason)
                        : read === null
                          ? t("itemWaiting")
                          : t("resultPlaceholder")
                }
                readOnly={read === null}
                // One filled Copy on screen: several boxes share the outline.
                primary={images.length === 1}
                copied={copied === key}
                onCopy={() => void handleCopy(key, read?.text ?? "")}
                onChange={(text) => {
                    if (read !== null) {
                        patchImage(image.id, { read: { ...read, text } });
                    }
                }}
                className="lg:h-full"
                textareaClassName="min-h-40 flex-1"
            />
        );
    }

    const status = describeStatus();
    // Storage is read only once offline, which `useOnline` never reports during
    // hydration — so the server pass and the first client pass still agree.
    const languageMissing = !online && !readFetchedLanguages().includes(language);
    const intakeDisabled = running || languageMissing;

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex min-w-0 flex-col gap-5">
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
                    <div className="sm:col-span-2">
                        <OptionsDisclosure>
                            {/* A view of the same reads, so it can change mid-batch. */}
                            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                                <OptionSelect<ResultLayout>
                                    label={t("layoutLabel")}
                                    hint={t("layoutHint")}
                                    value={layout}
                                    values={RESULT_LAYOUTS}
                                    items={Object.fromEntries(
                                        RESULT_LAYOUTS.map((value) => [
                                            value,
                                            t(`layouts.${value}`),
                                        ]),
                                    )}
                                    onChange={setLayout}
                                />
                            </div>
                        </OptionsDisclosure>
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    <StepLabel step={1} htmlFor={inputId}>
                        {t("dropTitle")}
                    </StepLabel>
                    <ImageDropzone
                        inputId={inputId}
                        title={null}
                        hint={t("dropHint", {
                            limit: byteLabel(MAX_IMAGE_BYTES),
                            count: MAX_IMAGES,
                        })}
                        accept={IMAGE_ACCEPT_ATTRIBUTE}
                        multiple
                        disabled={intakeDisabled}
                        describedById={statusId}
                        onFiles={handleFiles}
                    />

                    <ImageSourceControls
                        onFiles={handleFiles}
                        disabled={intakeDisabled}
                        urlImportEnabled={urlImportEnabled}
                    />

                    {languageMissing && <OnlineRequiredNote kind="model" />}

                    <StatusStrip id={statusId} tone={status.tone} message={status.message} />

                    {rejections.map((rejection, index) => (
                        <StatusStrip
                            key={`${rejection.name}-${index}`}
                            tone="error"
                            message={t("rejected", {
                                name: rejection.name,
                                problem: describeFailure(rejection.reason),
                            })}
                        />
                    ))}
                </div>

                {images.length > 0 && (
                    <section
                        ref={resultRef}
                        aria-labelledby={picturesId}
                        className={cn(RESULT_TRAY, "scroll-mt-24")}
                    >
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <h3
                                id={picturesId}
                                className="text-[0.8125rem] leading-[1.3] font-medium"
                            >
                                {t("picturesLabel", { count: images.length })}
                            </h3>
                            <div className="flex shrink-0 gap-2">
                                <Button
                                    variant="outline"
                                    onClick={handleReadAgain}
                                    disabled={intakeDisabled}
                                    className="h-8 px-2.5"
                                >
                                    <IconRefresh
                                        className="size-4"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("readAgain")}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleClear}
                                    className="h-8 px-2.5"
                                >
                                    <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                                    {t("clear")}
                                </Button>
                            </div>
                        </div>

                        {layout === "separate" ? (
                            // Each picture beside its own box; the box is at
                            // least as tall as its picture and grows past it.
                            <ol className="flex min-w-0 flex-col gap-4">
                                {images.map((image, index) => (
                                    <li
                                        key={image.id}
                                        className="bg-card/60 ring-border/70 grid min-w-0 gap-3 rounded-xl p-2 ring-1 ring-inset lg:grid-cols-2"
                                    >
                                        {renderPicture(image, index)}
                                        {renderItemBox(image, index)}
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            // The combined box stretches to the whole column of
                            // pictures, not one picture's height, and grows with
                            // its text past that.
                            <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                                <ol className="flex min-w-0 flex-col gap-3">
                                    {images.map((image, index) => (
                                        <li
                                            key={image.id}
                                            className="bg-card/60 ring-border/70 min-w-0 rounded-xl p-2 ring-1 ring-inset"
                                        >
                                            {renderPicture(image, index)}
                                        </li>
                                    ))}
                                </ol>

                                <ResultTextBox
                                    label={t("resultLabel")}
                                    text={combinedText}
                                    language={readLanguage ?? language}
                                    placeholder={
                                        running ? t("resultWaiting") : t("resultPlaceholder")
                                    }
                                    copied={copied === COMBINED_COPY_KEY}
                                    onCopy={() => void handleCopy(COMBINED_COPY_KEY, combinedText)}
                                    onChange={setCombinedEdited}
                                    className="lg:h-full"
                                    textareaClassName="min-h-[32rem] flex-1"
                                />
                            </div>
                        )}
                    </section>
                )}
            </CardContent>
        </Card>
    );
}
