"use client";

import {
    IconFileZip,
    IconLoader2,
    IconPhotoPlus,
    IconTransform,
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
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { buildZipArchive } from "@/modules/tools/domain/archive";
import { copyText } from "@/modules/tools/domain/clipboard";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { checkImageFile } from "@/modules/tools/domain/image-file";
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
import { convertImage } from "../domain/convert";
import { buildFaviconHeadHtml, FAVICON_ICO_SIZES } from "../domain/favicon";
import { buildArchiveFilename, buildPackFilename } from "../domain/filenames";
import { buildArchivePaths } from "../domain/outputs";
import {
    backgroundValues,
    clampQuality,
    iconSizesApply,
    needsWork,
    optionsSignature,
    qualityApplies,
    resizeApplies,
    type ConversionQueueRow,
} from "../domain/targets";
import { IconSizeMenu } from "./icon-size-menu";
import { ConversionRow } from "./conversion-row";
import {
    CONVERSION_TARGETS,
    type BackgroundChoice,
    type ConversionFailureReason,
    type ConversionOptions,
    type ConversionTarget,
    type ConvertedImage,
    type IconSize,
} from "../types";

/** One picked file and everything the queue knows about it. */
type QueueItem = {
    readonly id: string;
    readonly file: File;
    readonly previewUrl: string;
    readonly status: "queued" | "working" | "done" | "failed";
    readonly result: ConvertedImage | null;
    readonly reason: ConversionFailureReason | null;
    /** The settings this result was produced under, or `null` if there is none. */
    readonly signature: string | null;
};

/** `null` is the "keep original size" entry, and needs a value a `<Select>` can hold. */
const ORIGINAL_EDGE = "original";

const RESIZE_VALUES = RESIZE_EDGES.map((edge) => (edge === null ? ORIGINAL_EDGE : String(edge)));

const SNIPPET_KEY = "favicon-head";

function toMaxEdge(value: string): number | null {
    return value === ORIGINAL_EDGE ? null : Number(value);
}

function fromMaxEdge(maxEdge: number | null): string {
    return maxEdge === null ? ORIGINAL_EDGE : String(maxEdge);
}

type ImageConverterWorkbenchProps = {
    /** Parsed from the search params on the server, so a shared link opens ready. */
    initialOptions: ConversionOptions;
    /** Whether this deployment can fetch a picture by its address at all. */
    urlImportEnabled: boolean;
};

export function ImageConverterWorkbench({
    initialOptions,
    urlImportEnabled,
}: ImageConverterWorkbenchProps) {
    const t = useTranslations("imageConverter.workbench");
    const tTargets = useTranslations("imageConverter.targets");
    const tBackgrounds = useTranslations("imageConverter.backgrounds");
    const tErrors = useTranslations("imageConverter.errors");
    const tToast = useTranslations("imageConverter.toast");
    const format = useFormatter();
    const byteLabel = useByteLabel();
    const [copied, markCopied] = useCopyFeedback<typeof SNIPPET_KEY>();

    const inputId = useId();
    const hintId = useId();
    const qualityId = useId();

    const [items, setItems] = useState<readonly QueueItem[]>([]);
    const [options, setOptions] = useState<ConversionOptions>(initialOptions);
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
    const finished = items.filter((item) => item.result !== null);
    const outputCount = finished.reduce(
        (total, item) => total + (item.result?.files.length ?? 0),
        0,
    );
    const stale = items.some((item) => item.result !== null && item.signature !== signature);
    const failedCount = items.filter((item) => item.status === "failed").length;
    const pendingCount = items.filter((item) => needsWork(queueRow(item), signature)).length;
    const canConvert = !working && pendingCount > 0;

    const backgrounds = backgroundValues(options.target);
    const qualityLive = qualityApplies(options.target);
    const resizeLive = resizeApplies(options.target);
    const sizesLive = iconSizesApply(options.target);
    // The pack's sizes are fixed, so the disabled control shows what will
    // actually be written rather than whatever was last chosen for an ICO.
    const shownSizes = options.target === "favicon" ? FAVICON_ICO_SIZES : options.iconSizes;

    function describeFailure(reason: ConversionFailureReason): string {
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

        if (failedCount > 0 && outputCount === 0) {
            return { tone: "error", message: t("statusFailed", { count: failedCount }) };
        }

        if (outputCount === 0) {
            return { tone: "idle", message: t("statusIdle") };
        }

        return { tone: "success", message: t("statusDone", { count: outputCount }) };
    }

    function patchOptions(patch: Partial<ConversionOptions>) {
        setOptions((current) => {
            const next = { ...current, ...patch };
            // Switching to JPG removes `transparent` from the list, so a value
            // that is no longer offered has to move rather than sit unrendered.
            const allowed = backgroundValues(next.target);

            return allowed.includes(next.background) ? next : { ...next, background: allowed[0] };
        });
    }

    function toggleIconSize(size: IconSize) {
        setOptions((current) => {
            const next = current.iconSizes.includes(size)
                ? current.iconSizes.filter((entry) => entry !== size)
                : [...current.iconSizes, size];

            // The menu disables the last checked item, so this is belt and
            // braces rather than the path a click can take.
            return next.length === 0 ? current : { ...current, iconSizes: next };
        });
    }

    /** Convert the rows handed in, one after another, under the settings given. */
    async function run(pending: readonly QueueItem[], activeOptions: ConversionOptions) {
        if (running.current || pending.length === 0) {
            return;
        }

        const activeSignature = optionsSignature(activeOptions);

        running.current = true;
        setWorking(true);
        setProgress({ done: 0, total: pending.length });

        let converted = 0;

        try {
            for (const [index, item] of pending.entries()) {
                setProgress({ done: index, total: pending.length });
                setItems((current) => replaceItem(current, item.id, { status: "working" }));

                // Caught per file rather than per run: one picture the decoder
                // chokes on should not abandon the twenty queued behind it.
                const outcome = await convertImage(item.file, activeOptions).catch(
                    (caught: unknown) => {
                        logEvent("error", "image_converter.convert_threw", {
                            error: describeError(caught),
                        });

                        return { ok: false, reason: "encode_failed" } as const;
                    },
                );

                if (outcome.ok) {
                    converted += 1;
                    setItems((current) =>
                        replaceItem(current, item.id, {
                            status: "done",
                            result: outcome.image,
                            reason: null,
                            signature: activeSignature,
                        }),
                    );
                } else {
                    logEvent("warn", "image_converter.convert_failed", { reason: outcome.reason });
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

            if (converted > 0) {
                toast.success(tToast("converted", { count: converted }));
            }
        } finally {
            running.current = false;
            setWorking(false);
        }
    }

    /** The batch button: everything not converted yet, and nothing else. */
    function handleConvert() {
        void run(
            items.filter((item) => needsWork(queueRow(item), signature)),
            options,
        );
    }

    /** One row, on request — the only path that replaces a result already in hand. */
    function handleReconvert(id: string) {
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
        // Convert is what spends the reader's battery on them.
        setItems([...items, ...added]);
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        handlePick([...event.dataTransfer.files]);
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

    /** One row: a lone file saves as itself, a pack is zipped on the way out. */
    async function handleDownload(id: string) {
        const item = items.find((candidate) => candidate.id === id);
        const result = item?.result;

        if (item === undefined || result == null || result.files.length === 0) {
            return;
        }

        try {
            if (result.files.length === 1) {
                const [only] = result.files;

                saveBlob({ filename: only.name, blob: only.blob });
                toast.success(tToast("downloaded", { filename: only.name }));

                return;
            }

            const filename = buildPackFilename(item.file.name);
            const stamp = new Date();
            const entries = await Promise.all(
                result.files.map(async (entry) => ({
                    name: entry.name,
                    bytes: new Uint8Array(await entry.blob.arrayBuffer()),
                })),
            );

            saveBlob({
                filename,
                blob: new Blob([buildZipArchive(entries, stamp)], { type: "application/zip" }),
            });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "image_converter.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    async function handleDownloadAll() {
        const rows = items.flatMap((item) =>
            item.result === null ? [] : [{ sourceName: item.file.name, files: item.result.files }],
        );

        if (rows.length === 0) {
            return;
        }

        setPacking(true);

        try {
            const paths = buildArchivePaths(
                rows.map((row) => ({
                    sourceName: row.sourceName,
                    fileNames: row.files.map((file) => file.name),
                })),
            );
            const blobs = rows.flatMap((row) => row.files.map((file) => file.blob));
            const entries = await Promise.all(
                blobs.map(async (blob, index) => ({
                    name: paths[index],
                    bytes: new Uint8Array(await blob.arrayBuffer()),
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
            logEvent("error", "image_converter.archive_failed", { error: describeError(caught) });
            toast.error(tToast("archiveFailed"));
        } finally {
            setPacking(false);
        }
    }

    async function handleCopySnippet() {
        const result = await copyText(buildFaviconHeadHtml());

        if (result.ok) {
            markCopied(SNIPPET_KEY);
            toast.success(tToast("snippetCopied"));

            return;
        }

        logEvent("error", "image_converter.snippet_copy_failed", { reason: result.reason });
        toast.error(tToast("snippetCopyFailed"));
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
                            handlePick([...(event.target.files ?? [])]);
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

                    <ImageSourceControls
                        onFiles={handlePick}
                        disabled={working}
                        urlImportEnabled={urlImportEnabled}
                    />

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <OptionSelect<ConversionTarget>
                        label={t("targetLabel")}
                        hint={tTargets(`${options.target}Hint`)}
                        value={options.target}
                        values={CONVERSION_TARGETS}
                        disabled={working}
                        items={Object.fromEntries(
                            CONVERSION_TARGETS.map((value) => [value, tTargets(value)]),
                        )}
                        onChange={(next) => patchOptions({ target: next })}
                    />

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
                                disabled={working || !qualityLive}
                                onValueChange={(next) =>
                                    patchOptions({
                                        quality: clampQuality(
                                            Array.isArray(next)
                                                ? (next[0] ?? options.quality)
                                                : next,
                                            MIN_QUALITY,
                                            MAX_QUALITY,
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
                            {qualityLive
                                ? t("qualityHint", { value: options.quality })
                                : options.target === "png"
                                  ? t("qualityHintLossless")
                                  : t("qualityHintIcon")}
                        </p>
                    </div>

                    <OptionSelect<BackgroundChoice>
                        label={t("backgroundLabel")}
                        hint={
                            options.target === "jpeg"
                                ? t("backgroundHintJpeg")
                                : t("backgroundHint")
                        }
                        value={options.background}
                        values={backgrounds}
                        disabled={working}
                        items={Object.fromEntries(
                            backgrounds.map((value) => [value, tBackgrounds(value)]),
                        )}
                        onChange={(next) => patchOptions({ background: next })}
                    />

                    <OptionSelect<string>
                        label={t("resizeLabel")}
                        hint={resizeLive ? t("resizeHint") : t("resizeHintIcon")}
                        value={fromMaxEdge(options.maxEdge)}
                        values={RESIZE_VALUES}
                        disabled={working || !resizeLive}
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

                    <IconSizeMenu
                        value={shownSizes}
                        disabled={working || !sizesLive}
                        hint={sizesLive ? t("sizesHint") : t("sizesHintFixed")}
                        onToggle={toggleIconSize}
                    />
                </div>

                {options.target === "favicon" && (
                    <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-[0.8125rem] leading-[1.3] font-medium">
                                    {t("snippetTitle")}
                                </span>
                                <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("snippetDescription")}
                                </span>
                            </span>
                            <IconCopyButton
                                copied={copied === SNIPPET_KEY}
                                aria-label={t("snippetCopy")}
                                onClick={() => void handleCopySnippet()}
                            />
                        </div>
                        <pre className="min-w-0 overflow-x-auto font-mono text-[0.6875rem] leading-[1.6]">
                            <code>{buildFaviconHeadHtml().trimEnd()}</code>
                        </pre>
                    </div>
                )}

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
                    <Button onClick={handleConvert} disabled={!canConvert} className="h-9 px-3.5">
                        {working ? (
                            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <IconTransform className="size-4" stroke={1.9} aria-hidden="true" />
                        )}
                        {working
                            ? t("working", {
                                  done: format.number(progress.done + 1),
                                  total: format.number(progress.total),
                              })
                            : t("convert")}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => void handleDownloadAll()}
                        disabled={finished.length === 0 || packing || working}
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

                {/*
                 * Not dimmed when a row is stale, unlike the rows themselves.
                 * Every file counted here is one the reader keeps, whatever the
                 * panel says now.
                 */}
                {finished.length > 0 && (
                    <div className="bg-card/60 ring-border/70 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                        <span className="text-[0.8125rem] leading-[1.3] font-medium">
                            {t("summaryFiles", { count: finished.length })}
                        </span>
                        <span className="text-muted-foreground text-[0.8125rem] leading-[1.3]">
                            {t("summaryOutputs", { count: outputCount })}
                        </span>
                        <span className="text-muted-foreground text-[0.8125rem] leading-[1.3] tabular-nums">
                            {byteLabel(
                                finished.reduce(
                                    (total, item) => total + (item.result?.totalBytes ?? 0),
                                    0,
                                ),
                            )}
                        </span>
                    </div>
                )}

                {items.length > 0 && (
                    <ul className="flex min-w-0 flex-col gap-2">
                        {items.map((item) => (
                            <ConversionRow
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
                                busy={working}
                                describeFailure={describeFailure}
                                onReconvert={handleReconvert}
                                onDownload={(id) => void handleDownload(id)}
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

/** The three facts `needsWork` reads, without the file or the preview URL. */
function queueRow(item: QueueItem): ConversionQueueRow {
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
