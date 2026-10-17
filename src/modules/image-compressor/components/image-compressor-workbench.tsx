"use client";

import {
    IconArrowsMinimize,
    IconFileZip,
    IconInfoCircle,
    IconLoader2,
    IconShieldCheck,
    IconTrash,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageDropzone } from "@/modules/tools/components/image-dropzone";
import { ImageQueueHeader } from "@/modules/tools/components/image-queue";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { ToolNotes } from "@/modules/tools/components/tool-notes";
import { buildZipArchive } from "@/modules/tools/domain/archive";
import { uniqueFilenames } from "@/modules/tools/domain/filenames";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import {
    knownPixelSize,
    readImagePixelSize,
    type ImagePixelSize,
} from "@/modules/tools/domain/image-element";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import { compressImage } from "../domain/codec";
import {
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FILE_LIMITS,
    MAX_FILES,
    MAX_IMAGE_BYTES,
    MAX_PIXELS,
    MAX_QUALITY,
    MIN_QUALITY,
    RESIZE_EDGES,
} from "../domain/constants";
import { buildArchiveFilename, buildOutputFilename } from "../domain/filenames";
import {
    clampQuality,
    formatForSourceType,
    isLosslessFormat,
    needsWork,
    optionsSignature,
    qualityApplies,
    type CompressionQueueRow,
} from "../domain/options";
import { summariseSavings } from "../domain/savings";
import {
    OUTPUT_FORMATS,
    type CompressedImage,
    type CompressionFailureReason,
    type CompressionOptions,
    type OutputFormat,
} from "../types";
import { CompressionRow } from "./compression-row";

/** One picked file and everything the queue knows about it. */
type QueueItem = {
    readonly id: string;
    readonly file: File;
    readonly previewUrl: string;
    /** Measured once after the pick; `null` until then, or if it would not decode. */
    readonly dimensions: ImagePixelSize | null;
    readonly status: "queued" | "working" | "done" | "failed";
    readonly result: CompressedImage | null;
    readonly reason: CompressionFailureReason | null;
    /** The settings this result was produced under, or `null` if there is none. */
    readonly signature: string | null;
};

/** `null` is the "keep original size" entry, and needs a value a `<Select>` can hold. */
const ORIGINAL_EDGE = "original";

const RESIZE_VALUES = RESIZE_EDGES.map((edge) => (edge === null ? ORIGINAL_EDGE : String(edge)));

function toMaxEdge(value: string): number | null {
    return value === ORIGINAL_EDGE ? null : Number(value);
}

function fromMaxEdge(maxEdge: number | null): string {
    return maxEdge === null ? ORIGINAL_EDGE : String(maxEdge);
}

type ImageCompressorWorkbenchProps = {
    /** Parsed from the search params on the server, so a shared link opens ready. */
    initialOptions: CompressionOptions;
    /** Whether this deployment can fetch a picture by its address at all. */
    urlImportEnabled: boolean;
};

export function ImageCompressorWorkbench({
    initialOptions,
    urlImportEnabled,
}: ImageCompressorWorkbenchProps) {
    const t = useTranslations("imageCompressor.workbench");
    const tFormats = useTranslations("imageCompressor.formats");
    const tErrors = useTranslations("imageCompressor.errors");
    const tToast = useTranslations("imageCompressor.toast");
    const format = useFormatter();
    const byteLabel = useByteLabel();

    const inputId = useId();
    const hintId = useId();
    const qualityId = useId();
    const queueHeadingId = useId();
    const settingsHeadingId = useId();

    const [items, setItems] = useState<readonly QueueItem[]>([]);
    const [options, setOptions] = useState<CompressionOptions>(initialOptions);
    const [working, setWorking] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [packing, setPacking] = useState(false);

    // Ids come from a counter rather than `crypto.randomUUID`, so nothing in
    // this component is a per-render source of entropy.
    const nextId = useRef(0);
    const running = useRef(false);
    // Held outside state because the cleanup must see every URL ever handed out,
    // including ones added after the last render this effect closed over.
    const previewUrls = useRef(new Set<string>());

    useEffect(() => {
        const urls = previewUrls.current;

        return () => {
            for (const url of urls) {
                URL.revokeObjectURL(url);
            }

            urls.clear();
        };
    }, []);

    const signature = optionsSignature(options);
    const results = items.flatMap((item) =>
        item.result === null
            ? []
            : [{ originalBytes: item.file.size, outputBytes: item.result.bytes }],
    );
    const summary = summariseSavings(results);
    const totalBytes = items.reduce((total, item) => total + item.file.size, 0);
    const stale = items.some((item) => item.result !== null && item.signature !== signature);
    const failedCount = items.filter((item) => item.status === "failed").length;
    const pendingCount = items.filter((item) => needsWork(queueRow(item), signature)).length;
    const canCompress = !working && pendingCount > 0;
    // `auto` keeps a PNG a PNG, so the slider is live for the batch but dead for
    // part of it — worth saying, and different from PNG being forced on everything.
    const losslessOnly = !qualityApplies(options.format);
    const mixedLossless =
        options.format === "auto" &&
        items.some((item) => isLosslessFormat(formatForSourceType(item.file.type)));

    function describeFailure(reason: CompressionFailureReason): string {
        switch (reason) {
            case "empty_file":
                return tErrors("empty_file");
            case "unsupported_type":
                return tErrors("unsupported_type");
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_IMAGE_BYTES) });
            case "too_many_files":
                return tErrors("too_many_files", { count: format.number(MAX_FILES) });
            case "too_many_pixels":
                return tErrors("too_many_pixels", {
                    count: format.number(Math.round(MAX_PIXELS / 1_000_000)),
                });
            case "undecodable":
                return tErrors("undecodable");
            case "encode_failed":
                return tErrors("encode_failed");
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (working) {
            return {
                tone: "pending",
                message: t("statusWorking", {
                    done: format.number(progress.done + 1),
                    total: format.number(progress.total),
                }),
            };
        }

        if (items.length === 0) {
            return { tone: "idle", message: t("statusIdle") };
        }

        // Ahead of staleness: what the button will do next matters more than
        // what earlier settings produced, and only unfinished rows are pending.
        if (pendingCount > 0) {
            return { tone: "idle", message: t("statusReady", { count: pendingCount }) };
        }

        if (stale) {
            return { tone: "warning", message: t("statusStale") };
        }

        if (failedCount > 0 && summary.count === 0) {
            return { tone: "error", message: t("statusFailed", { count: failedCount }) };
        }

        if (summary.count === 0) {
            return { tone: "idle", message: t("statusIdle") };
        }

        return summary.percent > 0
            ? {
                  tone: "success",
                  message: t("statusDone", { percent: format.number(summary.percent) }),
              }
            : { tone: "warning", message: t("statusDoneNoSaving") };
    }

    function patchOptions(patch: Partial<CompressionOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    /** Encode the rows handed in, one after another, under the settings given. */
    async function run(pending: readonly QueueItem[], activeOptions: CompressionOptions) {
        if (running.current || pending.length === 0) {
            return;
        }

        const activeSignature = optionsSignature(activeOptions);

        running.current = true;
        setWorking(true);
        setProgress({ done: 0, total: pending.length });

        let compressed = 0;

        try {
            for (const [index, item] of pending.entries()) {
                setProgress({ done: index, total: pending.length });
                setItems((current) => replaceItem(current, item.id, { status: "working" }));

                // Caught per file rather than per run: one picture the decoder
                // chokes on should not abandon the twenty queued behind it.
                const outcome = await compressImage(item.file, activeOptions).catch(
                    (caught: unknown) => {
                        logEvent("error", "image_compressor.compress_threw", {
                            error: describeError(caught),
                        });

                        return { ok: false, reason: "encode_failed" } as const;
                    },
                );

                if (outcome.ok) {
                    compressed += 1;
                    setItems((current) =>
                        replaceItem(current, item.id, {
                            status: "done",
                            result: outcome.image,
                            reason: null,
                            signature: activeSignature,
                        }),
                    );
                } else {
                    logEvent("warn", "image_compressor.compress_failed", {
                        reason: outcome.reason,
                    });
                    setItems((current) =>
                        replaceItem(current, item.id, {
                            status: "failed",
                            result: null,
                            reason: outcome.reason,
                            signature: activeSignature,
                        }),
                    );
                }
            }

            if (compressed > 0) {
                toast.success(tToast("compressed", { count: compressed }));
            }
        } finally {
            running.current = false;
            setWorking(false);
        }
    }

    /** The batch button: everything not compressed yet, and nothing else. */
    function handleCompress() {
        void run(
            items.filter((item) => needsWork(queueRow(item), signature)),
            options,
        );
    }

    /** One row, on request — the only path that replaces a result already in hand. */
    function handleRecompress(id: string) {
        const item = items.find((candidate) => candidate.id === id);

        if (item !== undefined) {
            void run([item], options);
        }
    }

    function handlePick(picked: readonly File[]) {
        if (working) {
            return;
        }

        const files = [...picked];
        const room = Math.max(0, MAX_FILES - items.length);
        const accepted = files.slice(0, room);

        if (files.length > accepted.length) {
            toast.error(describeFailure("too_many_files"));
        }

        if (accepted.length === 0) {
            return;
        }

        const added = accepted.map<QueueItem>((file) => {
            const url = URL.createObjectURL(file);

            previewUrls.current.add(url);

            const checked = checkImageFile(file, IMAGE_FILE_LIMITS);

            return {
                id: `item-${(nextId.current += 1)}`,
                file,
                previewUrl: url,
                dimensions: null,
                status: checked.ok ? "queued" : "failed",
                result: null,
                reason: checked.ok ? null : checked.reason,
                signature: null,
            };
        });

        const rejected = added.filter((item) => item.status === "failed").length;

        if (rejected > 0) {
            toast.error(tToast("rejected", { count: rejected }));
        }

        // Deliberately not started here: picking files fills the queue, pressing
        // Compress is what spends the reader's battery on them.
        setItems([...items, ...added]);
        measure(added);
    }

    /**
     * Reads each new picture's pixel size once, after it is already listed, so
     * the row appears the moment the file is picked and its dimensions follow.
     * A row removed in the meantime is simply not found.
     */
    function measure(added: readonly QueueItem[]) {
        for (const item of added) {
            void readImagePixelSize(item.previewUrl).then((size) => {
                setItems((current) =>
                    replaceItem(current, item.id, { dimensions: knownPixelSize(size) }),
                );
            });
        }
    }

    function releasePreview(url: string) {
        URL.revokeObjectURL(url);
        previewUrls.current.delete(url);
    }

    function handleRemove(id: string) {
        setItems((current) => {
            const target = current.find((item) => item.id === id);

            if (target !== undefined) {
                releasePreview(target.previewUrl);
            }

            return current.filter((item) => item.id !== id);
        });
    }

    function handleClear() {
        for (const item of items) {
            releasePreview(item.previewUrl);
        }

        setItems([]);
    }

    function handleDownload(id: string) {
        const item = items.find((candidate) => candidate.id === id);

        if (item?.result == null) {
            return;
        }

        const filename = buildOutputFilename(item.file.name, item.result.format);

        try {
            saveBlob({ filename, blob: item.result.blob });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "image_compressor.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    async function handleDownloadAll() {
        const finished = items.flatMap((item) =>
            item.result === null ? [] : [{ name: item.file.name, result: item.result }],
        );

        if (finished.length === 0) {
            return;
        }

        setPacking(true);

        try {
            const names = uniqueFilenames(
                finished.map((entry) => buildOutputFilename(entry.name, entry.result.format)),
            );
            const entries = await Promise.all(
                finished.map(async (entry, index) => ({
                    name: names[index],
                    bytes: new Uint8Array(await entry.result.blob.arrayBuffer()),
                })),
            );

            const stamp = new Date();
            const filename = buildArchiveFilename(stamp);

            saveBlob({
                filename,
                blob: new Blob([buildZipArchive(entries, stamp)], { type: "application/zip" }),
            });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "image_compressor.archive_failed", { error: describeError(caught) });
            toast.error(tToast("archiveFailed"));
        } finally {
            setPacking(false);
        }
    }

    const status = describeStatus();

    return (
        // `overflow-visible` overrides the vendor Card's own `overflow-hidden`
        // so the settings column can be sticky: an ancestor whose overflow is
        // not `visible` becomes the sticky element's scroll container. The
        // hairline below is inset rather than clipped for the same reason.
        <Card className="relative overflow-visible [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
                    {/*
                     * The picked files sit directly under the intake, not under
                     * the settings: "did that pick work" is the first thing a
                     * reader wants answered, and on a long settings panel the
                     * list used to start below the fold.
                     */}
                    {/*
                     * Stretched to the settings column's height, and with an
                     * empty queue the dropzone grows into it — otherwise the
                     * intake is a short strip beside a tall panel, with a hole
                     * underneath it.
                     */}
                    <div className="flex min-w-0 flex-col gap-4 lg:self-stretch">
                        <div
                            className={cn(
                                "flex min-w-0 flex-col gap-2",
                                items.length === 0 && "flex-1",
                            )}
                        >
                            <ImageDropzone
                                inputId={inputId}
                                describedById={hintId}
                                multiple
                                compact={items.length > 0}
                                className={items.length === 0 ? "min-h-52 flex-1" : undefined}
                                accept={IMAGE_ACCEPT_ATTRIBUTE}
                                disabled={working}
                                title={items.length > 0 ? t("dropMoreTitle") : t("dropTitle")}
                                hint={t("dropHint", {
                                    limit: byteLabel(MAX_IMAGE_BYTES),
                                    count: format.number(MAX_FILES),
                                })}
                                onFiles={handlePick}
                            />

                            <ImageSourceControls
                                onFiles={handlePick}
                                disabled={working}
                                urlImportEnabled={urlImportEnabled}
                            />

                            <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                        </div>

                        {items.length > 0 && (
                            <section
                                aria-labelledby={queueHeadingId}
                                className="flex min-w-0 flex-col gap-2.5"
                            >
                                <ImageQueueHeader
                                    id={queueHeadingId}
                                    count={items.length}
                                    totalBytes={totalBytes}
                                    actions={
                                        <Button
                                            variant="ghost"
                                            onClick={handleClear}
                                            disabled={working}
                                            className="h-8 px-2.5 text-[0.8125rem]"
                                        >
                                            <IconTrash
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("clear")}
                                        </Button>
                                    }
                                />

                                {/*
                                 * Not dimmed when a row is stale, unlike the rows
                                 * themselves. Every result counted here is a
                                 * finished file the reader keeps, whatever the
                                 * panel says now.
                                 */}
                                {summary.count > 0 && (
                                    <div className="bg-card/60 ring-border/70 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                                        <span className="text-[0.8125rem] leading-[1.3] font-medium">
                                            {t("summaryFiles", { count: summary.count })}
                                        </span>
                                        <span className="text-muted-foreground text-[0.8125rem] leading-[1.3] tabular-nums">
                                            {byteLabel(summary.originalBytes)} →{" "}
                                            {byteLabel(summary.outputBytes)}
                                        </span>
                                        <span
                                            className={cn(
                                                "rounded-md px-1.5 py-0.5 text-[0.6875rem] leading-[1.3] font-medium tabular-nums",
                                                summary.percent > 0
                                                    ? "bg-[color-mix(in_oklch,var(--color-success)_14%,transparent)] text-[var(--color-success)]"
                                                    : "bg-muted text-muted-foreground",
                                            )}
                                        >
                                            {summary.percent > 0
                                                ? t("summarySaved", {
                                                      percent: format.number(summary.percent),
                                                  })
                                                : summary.percent < 0
                                                  ? t("summaryGrew", {
                                                        percent: format.number(
                                                            Math.abs(summary.percent),
                                                        ),
                                                    })
                                                  : t("summaryUnchanged")}
                                        </span>
                                    </div>
                                )}

                                <ul className="flex min-w-0 flex-col gap-2">
                                    {items.map((item) => (
                                        <CompressionRow
                                            key={item.id}
                                            item={{
                                                id: item.id,
                                                name: item.file.name,
                                                bytes: item.file.size,
                                                type: item.file.type,
                                                dimensions: item.dimensions,
                                                previewUrl: item.previewUrl,
                                                status: item.status,
                                                result: item.result,
                                                reason: item.reason,
                                                stale:
                                                    item.result !== null &&
                                                    item.signature !== signature,
                                            }}
                                            busy={working}
                                            describeFailure={describeFailure}
                                            onRecompress={handleRecompress}
                                            onDownload={handleDownload}
                                            onRemove={handleRemove}
                                        />
                                    ))}
                                </ul>
                            </section>
                        )}
                    </div>

                    {/*
                     * Sticky, and `self-start` (from `items-start` on the grid)
                     * is what makes that work: a stretched grid item leaves
                     * nothing for `position: sticky` to slide against. With a
                     * long queue the button that runs it stays in reach.
                     */}
                    <div
                        role="group"
                        aria-labelledby={settingsHeadingId}
                        className="bg-muted/30 ring-border/70 flex min-w-0 flex-col gap-4 rounded-xl p-4 ring-1 ring-inset lg:sticky lg:top-6"
                    >
                        <h3
                            id={settingsHeadingId}
                            className="text-[0.875rem] leading-[1.3] font-medium"
                        >
                            {t("settingsTitle")}
                        </h3>

                        <div className="flex min-w-0 flex-col gap-1.5">
                            <span
                                id={qualityId}
                                className="text-muted-foreground text-xs leading-[1.3]"
                            >
                                {t("qualityLabel")}
                            </span>
                            <div className="flex min-w-0 items-center gap-3">
                                <Slider
                                    aria-labelledby={qualityId}
                                    value={options.quality}
                                    min={MIN_QUALITY}
                                    max={MAX_QUALITY}
                                    disabled={working || losslessOnly}
                                    onValueChange={(next) =>
                                        patchOptions({
                                            quality: clampQuality(
                                                Array.isArray(next)
                                                    ? (next[0] ?? options.quality)
                                                    : next,
                                            ),
                                        })
                                    }
                                    className="min-w-0 flex-1"
                                />
                                <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums">
                                    {options.quality}
                                </span>
                            </div>
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {losslessOnly
                                    ? t("qualityHintLossless")
                                    : mixedLossless
                                      ? t("qualityHintMixed")
                                      : t("qualityHint")}
                            </p>
                        </div>

                        <OptionSelect<OutputFormat>
                            label={t("formatLabel")}
                            hint={tFormats(`${options.format}Hint`)}
                            value={options.format}
                            values={OUTPUT_FORMATS}
                            disabled={working}
                            items={Object.fromEntries(
                                OUTPUT_FORMATS.map((value) => [value, tFormats(value)]),
                            )}
                            onChange={(next) => patchOptions({ format: next })}
                        />

                        <OptionSelect<string>
                            label={t("resizeLabel")}
                            hint={t("resizeHint")}
                            value={fromMaxEdge(options.maxEdge)}
                            values={RESIZE_VALUES}
                            disabled={working}
                            items={Object.fromEntries(
                                RESIZE_VALUES.map((value) => [
                                    value,
                                    value === ORIGINAL_EDGE
                                        ? t("resizeOriginal")
                                        : t("resizePreset", { value }),
                                ]),
                            )}
                            onChange={(next) => patchOptions({ maxEdge: toMaxEdge(next) })}
                        />

                        {working && (
                            <div
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={progress.total}
                                aria-valuenow={progress.done}
                                aria-label={t("working", {
                                    done: format.number(progress.done + 1),
                                    total: format.number(progress.total),
                                })}
                                className="bg-muted h-1 w-full overflow-hidden rounded-full"
                            >
                                <span
                                    className="bg-primary block h-full rounded-full transition-[width] duration-300"
                                    style={{
                                        width: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%`,
                                    }}
                                />
                            </div>
                        )}

                        <div className="flex min-w-0 flex-col gap-2">
                            <Button
                                onClick={handleCompress}
                                disabled={!canCompress}
                                className="h-10 w-full"
                            >
                                {working ? (
                                    <IconLoader2
                                        className="size-4 animate-spin"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <IconArrowsMinimize
                                        className="size-4"
                                        stroke={1.9}
                                        aria-hidden="true"
                                    />
                                )}
                                {working
                                    ? t("working", {
                                          done: format.number(progress.done + 1),
                                          total: format.number(progress.total),
                                      })
                                    : t("compress")}
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => void handleDownloadAll()}
                                disabled={summary.count === 0 || packing || working}
                                className="h-9 w-full"
                            >
                                {packing ? (
                                    <IconLoader2
                                        className="size-4 animate-spin"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <IconFileZip
                                        className="size-4"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                )}
                                {packing ? t("packing") : t("downloadAll")}
                            </Button>
                        </div>
                    </div>
                </div>

                <ToolNotes
                    notes={[
                        {
                            key: "privacy",
                            icon: IconShieldCheck,
                            tone: "success",
                            title: t("privacyTitle"),
                            body: t("privacyNote"),
                        },
                        {
                            key: "metadata",
                            icon: IconInfoCircle,
                            title: t("metadataTitle"),
                            body: t("metadataNote"),
                        },
                    ]}
                />
            </CardContent>
        </Card>
    );
}

/** The three facts `needsWork` reads, without the file or the preview URL. */
function queueRow(item: QueueItem): CompressionQueueRow {
    return {
        hasResult: item.result !== null,
        reason: item.reason,
        signature: item.signature,
    };
}

function replaceItem(
    items: readonly QueueItem[],
    id: string,
    patch: Partial<QueueItem>,
): readonly QueueItem[] {
    return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}
