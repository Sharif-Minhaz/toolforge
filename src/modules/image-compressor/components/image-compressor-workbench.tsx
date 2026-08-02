"use client";

import {
    IconArrowsMinimize,
    IconFileZip,
    IconLoader2,
    IconPhotoPlus,
    IconTrash,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import { buildZipArchive } from "../domain/archive";
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
import { buildArchiveFilename, buildOutputFilename, uniqueFilenames } from "../domain/filenames";
import {
    clampQuality,
    formatForSourceType,
    isLosslessFormat,
    isRetryableFailure,
    optionsSignature,
    qualityApplies,
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
};

export function ImageCompressorWorkbench({ initialOptions }: ImageCompressorWorkbenchProps) {
    const t = useTranslations("imageCompressor.workbench");
    const tFormats = useTranslations("imageCompressor.formats");
    const tErrors = useTranslations("imageCompressor.errors");
    const tToast = useTranslations("imageCompressor.toast");
    const format = useFormatter();
    const byteLabel = useByteLabel();

    const inputId = useId();
    const hintId = useId();
    const qualityId = useId();

    const [items, setItems] = useState<readonly QueueItem[]>([]);
    const [options, setOptions] = useState<CompressionOptions>(initialOptions);
    const [dragging, setDragging] = useState(false);
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
    const stale = items.some((item) => item.result !== null && item.signature !== signature);
    const failedCount = items.filter((item) => item.status === "failed").length;
    const pendingCount = items.filter((item) => needsWork(item, signature)).length;
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

        if (stale) {
            return { tone: "warning", message: t("statusStale") };
        }

        if (pendingCount > 0) {
            return { tone: "idle", message: t("statusReady", { count: pendingCount }) };
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

    async function run(queue: readonly QueueItem[], activeOptions: CompressionOptions) {
        if (running.current) {
            return;
        }

        const activeSignature = optionsSignature(activeOptions);
        const pending = queue.filter((item) => needsWork(item, activeSignature));

        if (pending.length === 0) {
            return;
        }

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

    function handlePick(picked: FileList | null) {
        if (picked === null || working) {
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

        const queue = [...items, ...added];

        setItems(queue);
        void run(queue, options);
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        handlePick(event.dataTransfer.files);
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
                <div className="flex min-w-0 flex-col gap-2">
                    <input
                        id={inputId}
                        type="file"
                        multiple
                        accept={IMAGE_ACCEPT_ATTRIBUTE}
                        disabled={working}
                        aria-describedby={hintId}
                        onChange={(event) => {
                            handlePick(event.target.files);
                            // Cleared so picking the same file twice still fires.
                            event.target.value = "";
                        }}
                        className="peer sr-only"
                    />

                    <label
                        htmlFor={inputId}
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        className={cn(
                            "border-border/80 bg-card/40 hover:border-primary/50 peer-focus-visible:ring-ring flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors duration-200 peer-focus-visible:ring-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                            dragging &&
                                "border-primary/70 bg-[color-mix(in_oklch,var(--primary)_6%,transparent)]",
                        )}
                    >
                        <IconPhotoPlus
                            className="text-muted-foreground size-7"
                            stroke={1.6}
                            aria-hidden="true"
                        />
                        <span className="text-[0.9375rem] leading-[1.4] font-medium">
                            {t("dropTitle")}
                        </span>
                        <span className="text-muted-foreground text-[0.8125rem] leading-normal">
                            {t("dropHint", {
                                limit: byteLabel(MAX_IMAGE_BYTES),
                                count: format.number(MAX_FILES),
                            })}
                        </span>
                    </label>

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                                  : t("qualityHint", { value: options.quality })}
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
                </div>

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

                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button
                        onClick={() => void run(items, options)}
                        disabled={!canCompress}
                        className="h-9 px-3.5"
                    >
                        {working ? (
                            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
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
                            : stale
                              ? t("recompress")
                              : t("compress")}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => void handleDownloadAll()}
                        disabled={summary.count === 0 || packing || working}
                        className="h-9 px-3.5"
                    >
                        {packing ? (
                            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <IconFileZip className="size-4" stroke={1.8} aria-hidden="true" />
                        )}
                        {packing ? t("packing") : t("downloadAll")}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={handleClear}
                        disabled={items.length === 0 || working}
                        className="h-9 px-3.5"
                    >
                        <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                </div>

                {summary.count > 0 && (
                    <div
                        className={cn(
                            "bg-card/60 ring-border/70 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 ring-1 ring-inset",
                            "transition-opacity duration-200",
                            stale && "opacity-55",
                        )}
                    >
                        <span className="text-[0.8125rem] leading-[1.3] font-medium">
                            {t("summaryFiles", { count: summary.count })}
                        </span>
                        <span className="text-muted-foreground text-[0.8125rem] leading-[1.3] tabular-nums">
                            {byteLabel(summary.originalBytes)} → {byteLabel(summary.outputBytes)}
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
                                ? t("summarySaved", { percent: format.number(summary.percent) })
                                : summary.percent < 0
                                  ? t("summaryGrew", {
                                        percent: format.number(Math.abs(summary.percent)),
                                    })
                                  : t("summaryUnchanged")}
                        </span>
                    </div>
                )}

                {items.length > 0 && (
                    <ul className="flex min-w-0 flex-col gap-2">
                        {items.map((item) => (
                            <CompressionRow
                                key={item.id}
                                item={{
                                    id: item.id,
                                    name: item.file.name,
                                    bytes: item.file.size,
                                    previewUrl: item.previewUrl,
                                    status: item.status,
                                    result: item.result,
                                    reason: item.reason,
                                    stale: item.result !== null && item.signature !== signature,
                                }}
                                describeFailure={describeFailure}
                                onDownload={handleDownload}
                                onRemove={handleRemove}
                            />
                        ))}
                    </ul>
                )}

                <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                    {t("metadataNote")}
                </p>

                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("privacyNote")}
                </p>
            </CardContent>
        </Card>
    );
}

/** Rows that the next run should touch: never-compressed, or compressed under other settings. */
function needsWork(item: QueueItem, signature: string): boolean {
    if (item.status === "failed") {
        return (
            item.reason !== null && isRetryableFailure(item.reason) && item.signature !== signature
        );
    }

    return item.signature !== signature;
}

function replaceItem(
    items: readonly QueueItem[],
    id: string,
    patch: Partial<QueueItem>,
): readonly QueueItem[] {
    return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}
