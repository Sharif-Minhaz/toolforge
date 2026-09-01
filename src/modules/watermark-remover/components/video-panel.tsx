"use client";

import {
    IconEraser,
    IconLoader2,
    IconRefresh,
    IconTrash,
    IconVideoPlus,
    IconX,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { buildCleanVideoFilename } from "../domain/export";
import {
    MAX_VIDEO_BYTES,
    MAX_VIDEO_SECONDS,
    VIDEO_ACCEPT_ATTRIBUTE,
} from "../domain/video-constants";
import { checkVideoFile } from "../domain/video-file";
import { cleanVideo, probeVideo } from "../domain/video-pipeline";
import { hasVideoCodecs } from "../domain/webcodecs";
import { planDefaultBox, toPixelBox } from "../domain/watermark-box";
import type {
    CleanedVideo,
    NormalizedBox,
    SourceVideoFacts,
    VideoCleanProgress,
    VideoFailureReason,
} from "../types";
import { CleanedVideoResult } from "./cleaned-video-result";
import { WatermarkBoxEditor } from "./watermark-box-editor";

/** The picked clip, its preview URL, and everything the container said about it. */
type Picked = {
    readonly file: File;
    readonly url: string;
    readonly facts: SourceVideoFacts;
};

/**
 * Everything one answer is about, so a later pick or a moved box cannot rewrite
 * the context the result was produced in. `beforeUrl` is the result's own handle
 * on the original: the preview's URL is revoked the moment a new clip is chosen,
 * and the comparison has to survive that.
 */
type Cleaned = {
    readonly url: string;
    readonly beforeUrl: string;
    readonly video: CleanedVideo;
    readonly facts: SourceVideoFacts;
    readonly box: NormalizedBox;
};

/**
 * The video half: find the sparkle in one corner, rebuild what it was covering,
 * and write the clip back out.
 *
 * Nothing here is uploaded and nothing here is a model. The clip is demuxed,
 * decoded, painted and muxed by the browser's own codecs, and what replaces the
 * watermark is arithmetic over the pixels around it. That is why this half has no
 * bot check and no rate limit: there is no service on the other end of it to
 * protect.
 */
export function VideoPanel() {
    const t = useTranslations("watermarkRemover.video");
    const tErrors = useTranslations("watermarkRemover.videoErrors");
    const tToast = useTranslations("watermarkRemover.videoToast");
    const byteLabel = useByteLabel();
    const formatter = useFormatter();
    const hydrated = useIsHydrated();

    const inputId = useId();
    const hintId = useId();
    const boxHintId = useId();
    const fillId = useId();

    const abortRef = useRef<AbortController | null>(null);

    const [picked, setPicked] = useState<Picked | null>(null);
    const [box, setBox] = useState<NormalizedBox | null>(null);
    const [fillWholeBox, setFillWholeBox] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [probing, setProbing] = useState(false);
    const [working, setWorking] = useState(false);
    const [progress, setProgress] = useState<VideoCleanProgress | null>(null);
    const [result, setResult] = useState<Cleaned | null>(null);
    const [failure, setFailure] = useState<VideoFailureReason | null>(null);
    const { ref: resultRef, scrollToResult } = useResultScroll();

    // Revoking on the way out rather than in the picker: the cleanup fires both
    // when the preview is replaced and when the page is left, so there is one
    // rule instead of one per exit.
    useEffect(() => {
        const url = picked?.url;

        return () => {
            if (url !== undefined) {
                URL.revokeObjectURL(url);
            }
        };
    }, [picked?.url]);

    useEffect(() => {
        const urls = result === null ? [] : [result.url, result.beforeUrl];

        return () => {
            for (const url of urls) {
                URL.revokeObjectURL(url);
            }
        };
    }, [result]);

    // A run holds a decoder, an encoder and a muxer. Leaving the page mid-run
    // should stop all three rather than leave them working on a result nobody
    // will ever see.
    useEffect(() => () => abortRef.current?.abort(), []);

    // The server has no `VideoEncoder`, so this cannot be read during the first
    // pass without the two renders disagreeing. Until hydration the panel
    // renders as though the browser can do the work, which is the right guess
    // for every browser that will actually run it.
    const supported = !hydrated || hasVideoCodecs();
    const busy = probing || working;
    const canRemove = supported && picked !== null && box !== null && !busy;
    const stale = result !== null && (result.facts !== picked?.facts || result.box !== box);

    function describeFailure(reason: VideoFailureReason): string {
        switch (reason) {
            case "missing_video":
                return tErrors("missing_video");
            case "empty_file":
                return tErrors("empty_file");
            case "unsupported_type":
                return tErrors("unsupported_type");
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_VIDEO_BYTES) });
            case "too_long":
                return tErrors("too_long", {
                    limit: formatter.number(MAX_VIDEO_SECONDS),
                });
            case "unsupported_browser":
                return tErrors("unsupported_browser");
            case "unreadable_container":
                return tErrors("unreadable_container");
            case "no_video_track":
                return tErrors("no_video_track");
            case "undecodable":
                return tErrors("undecodable");
            case "no_encoder":
                return tErrors("no_encoder");
            case "mark_not_found":
                return tErrors("mark_not_found");
            case "clean_failed":
                return tErrors("clean_failed");
            case "canceled":
                return tErrors("canceled");
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (!supported) {
            return { tone: "error", message: describeFailure("unsupported_browser") };
        }

        if (probing) {
            return { tone: "pending", message: t("reading") };
        }

        if (working) {
            return {
                tone: "pending",
                message: t(`stage_${progress?.stage ?? "reading"}`),
            };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure) };
        }

        if (picked === null) {
            return {
                tone: "idle",
                message: t("pickPrompt", {
                    limit: byteLabel(MAX_VIDEO_BYTES),
                    seconds: formatter.number(MAX_VIDEO_SECONDS),
                }),
            };
        }

        return stale
            ? { tone: "warning", message: t("resultStale") }
            : { tone: "success", message: t("readyToRemove") };
    }

    function fail(reason: VideoFailureReason) {
        setResult(null);
        setFailure(reason);
        toast.error(describeFailure(reason));
    }

    async function handlePick(file: File | undefined) {
        if (file === undefined || busy) {
            return;
        }

        const checked = checkVideoFile(file);

        if (!checked.ok) {
            setPicked(null);
            setBox(null);
            fail(checked.reason);

            return;
        }

        setProbing(true);
        setFailure(null);

        try {
            const probe = await probeVideo(file);

            if (!probe.ok) {
                logEvent("warn", "watermark_remover.video_probe_failed", {
                    reason: probe.reason,
                    detail: probe.detail ?? null,
                });
                setPicked(null);
                setBox(null);
                fail(probe.reason);

                return;
            }

            setPicked({ file, url: URL.createObjectURL(file), facts: probe.facts });
            setBox(planDefaultBox({ width: probe.facts.width, height: probe.facts.height }));
            setResult(null);
        } catch (caught) {
            logEvent("error", "watermark_remover.video_probe_threw", {
                error: describeError(caught),
            });
            setPicked(null);
            setBox(null);
            fail("unreadable_container");
        } finally {
            setProbing(false);
        }
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        void handlePick(event.dataTransfer.files[0]);
    }

    async function handleRemove() {
        if (picked === null || box === null || !canRemove) {
            return;
        }

        const controller = new AbortController();

        abortRef.current = controller;
        setWorking(true);
        setFailure(null);
        setProgress({ stage: "reading", ratio: 0 });

        try {
            const outcome = await cleanVideo({
                file: picked.file,
                box,
                fillWholeBox,
                signal: controller.signal,
                onProgress: setProgress,
            });

            if (!outcome.ok) {
                if (outcome.reason !== "canceled") {
                    // `detail` is the codec's own words. Logged, never rendered:
                    // the reader gets the localised sentence for the reason.
                    logEvent("warn", "watermark_remover.video_clean_failed", {
                        reason: outcome.reason,
                        detail: outcome.detail ?? null,
                    });
                }

                fail(outcome.reason);

                return;
            }

            setResult({
                url: URL.createObjectURL(outcome.video.blob),
                beforeUrl: URL.createObjectURL(picked.file),
                video: outcome.video,
                facts: picked.facts,
                box,
            });
            scrollToResult();
            toast.success(tToast("removed"));
        } catch (caught) {
            logEvent("error", "watermark_remover.video_clean_threw", {
                error: describeError(caught),
            });
            fail("clean_failed");
        } finally {
            abortRef.current = null;
            setWorking(false);
            setProgress(null);
        }
    }

    function handleClear() {
        abortRef.current?.abort();
        setPicked(null);
        setBox(null);
        setResult(null);
        setFailure(null);
    }

    function handleDownload(current: Cleaned) {
        const download = {
            filename: buildCleanVideoFilename(current.facts.name, new Date()),
            blob: current.video.blob,
        };

        try {
            saveBlob(download);
            toast.success(tToast("downloaded", { filename: download.filename }));
        } catch (caught) {
            logEvent("error", "watermark_remover.video_download_failed", {
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    const status = describeStatus();
    const percent = progress === null ? 0 : Math.round(progress.ratio * 100);
    const searchBox =
        picked === null || box === null
            ? null
            : toPixelBox(box, { width: picked.facts.width, height: picked.facts.height });

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex min-w-0 flex-col gap-2">
                <input
                    id={inputId}
                    type="file"
                    accept={VIDEO_ACCEPT_ATTRIBUTE}
                    disabled={busy || !supported}
                    aria-describedby={hintId}
                    onChange={(event) => void handlePick(event.target.files?.[0])}
                    // Focusable but not laid out, so the label below can be the
                    // whole target while the keyboard still reaches it.
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
                    <IconVideoPlus
                        className="text-muted-foreground size-7"
                        stroke={1.6}
                        aria-hidden="true"
                    />
                    <span className="text-[0.9375rem] leading-[1.4] font-medium">
                        {t("dropTitle")}
                    </span>
                    <span className="text-muted-foreground text-[0.8125rem] leading-normal">
                        {t("dropHint", {
                            limit: byteLabel(MAX_VIDEO_BYTES),
                            seconds: formatter.number(MAX_VIDEO_SECONDS),
                        })}
                    </span>
                </label>

                {picked !== null && (
                    <p className="text-muted-foreground min-w-0 truncate font-mono text-[0.6875rem] leading-normal tabular-nums">
                        {t("sourceFacts", {
                            name: picked.facts.name,
                            size: byteLabel(picked.facts.bytes),
                            width: formatter.number(picked.facts.width),
                            height: formatter.number(picked.facts.height),
                            seconds: formatter.number(picked.facts.durationSeconds, {
                                maximumFractionDigits: 1,
                            }),
                            fps: formatter.number(picked.facts.frameRate, {
                                maximumFractionDigits: 2,
                            }),
                        })}
                    </p>
                )}

                <StatusStrip id={hintId} tone={status.tone} message={status.message} />
            </div>

            {picked !== null && box !== null && (
                <div className="flex min-w-0 flex-col gap-3">
                    <WatermarkBoxEditor
                        // Keyed on the file, so a new pick starts the frame
                        // slider on the new clip rather than wherever it was.
                        key={picked.url}
                        url={picked.url}
                        facts={picked.facts}
                        box={box}
                        disabled={working}
                        label={t("boxLabel")}
                        scrubLabel={t("scrubLabel")}
                        previewLabel={t("previewAlt", { name: picked.facts.name })}
                        describedById={boxHintId}
                        onBoxChange={setBox}
                    />

                    <p
                        id={boxHintId}
                        className="text-muted-foreground text-[0.6875rem] leading-normal"
                    >
                        {t("boxHint")}
                    </p>

                    {searchBox !== null && (
                        <p className="text-muted-foreground font-mono text-[0.6875rem] leading-normal tabular-nums">
                            {t("boxReadout", {
                                width: formatter.number(searchBox.width),
                                height: formatter.number(searchBox.height),
                                x: formatter.number(searchBox.x),
                                y: formatter.number(searchBox.y),
                            })}
                        </p>
                    )}

                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                            <Switch
                                checked={fillWholeBox}
                                disabled={working}
                                onCheckedChange={setFillWholeBox}
                                aria-labelledby={fillId}
                                aria-describedby={`${fillId}-hint`}
                            />
                            <span
                                id={fillId}
                                className="text-[0.8125rem] leading-[1.3] font-medium"
                            >
                                {t("fillWholeBox")}
                            </span>
                        </div>

                        <Button
                            variant="outline"
                            disabled={working}
                            onClick={() =>
                                setBox(
                                    planDefaultBox({
                                        width: picked.facts.width,
                                        height: picked.facts.height,
                                    }),
                                )
                            }
                            className="h-8 shrink-0 px-3 text-[0.8125rem]"
                        >
                            <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
                            {t("resetBox")}
                        </Button>
                    </div>

                    <p
                        id={`${fillId}-hint`}
                        className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal"
                    >
                        {t("fillWholeBoxHint")}
                    </p>
                </div>
            )}

            {working && (
                <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                            {t(`stage_${progress?.stage ?? "reading"}`)}
                        </p>
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.3] tabular-nums">
                            {t("percent", { percent: formatter.number(percent) })}
                        </p>
                    </div>

                    {/*
                        A real progressbar, not a decorated div: a minute-long
                        wait is exactly when somebody needs to know how far in
                        they are, and a coloured rectangle says nothing.
                    */}
                    <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        aria-label={t("progressLabel")}
                        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                    >
                        <div
                            className="bg-primary h-full rounded-full transition-[width] duration-300"
                            style={{ width: `${Math.max(percent, 2)}%` }}
                        />
                    </div>
                </div>
            )}

            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                    onClick={() => void handleRemove()}
                    disabled={!canRemove}
                    className="h-9 px-3.5"
                >
                    {working ? (
                        <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <IconEraser className="size-4" stroke={1.9} aria-hidden="true" />
                    )}
                    {working ? t("working") : t("remove")}
                </Button>

                {working ? (
                    <Button
                        variant="outline"
                        onClick={() => abortRef.current?.abort()}
                        className="h-9 px-3.5"
                    >
                        <IconX className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("cancel")}
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        onClick={handleClear}
                        disabled={picked === null || busy}
                        className="h-9 px-3.5"
                    >
                        <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                )}
            </div>

            {result !== null && (
                <div
                    ref={resultRef}
                    className={cn("min-w-0 transition-opacity duration-200", stale && "opacity-55")}
                >
                    <CleanedVideoResult
                        beforeUrl={result.beforeUrl}
                        afterUrl={result.url}
                        facts={result.facts}
                        video={result.video}
                        onDownload={() => handleDownload(result)}
                    />
                </div>
            )}

            {/*
             * Stated in the tool, not only in the article underneath: this
             * rebuilds one corner of somebody's footage, and the reader is the
             * only one who can know whether they hold the rights to it.
             */}
            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                {t("rightsNote")}
            </p>

            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                {t("privacyNote")}
            </p>
        </div>
    );
}
