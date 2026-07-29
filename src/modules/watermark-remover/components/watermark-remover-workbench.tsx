"use client";

import {
    IconArrowBackUp,
    IconEraser,
    IconLoader2,
    IconPhotoUp,
    IconTrash,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { loadImageElement } from "@/modules/tools/domain/image-element";
import { checkImageFile, normalizeImageType } from "@/modules/tools/domain/image-file";
import { removeWatermark } from "../actions/remove-watermark";
import { composeCleanedImage, cropRegionToModelPng, renderModelMaskPng } from "../domain/canvas";
import {
    DEFAULT_BRUSH_SIZE,
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FILE_LIMITS,
    IMAGE_FORM_FIELD,
    MASK_FORM_FIELD,
    MAX_BRUSH_SIZE,
    MAX_IMAGE_BYTES,
    MIN_BRUSH_SIZE,
    TOKEN_FORM_FIELD,
    TURNSTILE_ACTION,
} from "../domain/constants";
import { buildCleanImageFilename } from "../domain/export";
import { clampBrushSize, dropLastStroke, hasMaskCoverage } from "../domain/mask";
import { planRemovalRegion } from "../domain/region";
import type { MaskStroke, SourceImageFacts, WatermarkFailureReason } from "../types";
import { CleanedResult } from "./cleaned-result";
import { MaskCanvas } from "./mask-canvas";

/** The picked file, its preview, the decoded element, and everything shown about it. */
type Picked = {
    readonly file: File;
    readonly url: string;
    readonly element: HTMLImageElement;
    readonly facts: SourceImageFacts;
};

/**
 * Everything one answer is about, so a later pick or a further stroke cannot
 * rewrite the context the result was produced in. `beforeUrl` is the result's own
 * handle on the original: the preview's URL is revoked the moment a new file is
 * chosen, and the comparison has to survive that.
 */
type Cleaned = {
    readonly url: string;
    readonly beforeUrl: string;
    readonly blob: Blob;
    readonly facts: SourceImageFacts;
    readonly strokes: readonly MaskStroke[];
};

type WatermarkRemoverWorkbenchProps = {
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables the tool. */
    siteKey: string | null;
};

export function WatermarkRemoverWorkbench({ siteKey }: WatermarkRemoverWorkbenchProps) {
    const t = useTranslations("watermarkRemover.workbench");
    const tErrors = useTranslations("watermarkRemover.errors");
    const tToast = useTranslations("watermarkRemover.toast");
    const byteLabel = useByteLabel();

    const inputId = useId();
    const hintId = useId();
    const brushId = useId();
    const canvasHintId = useId();

    const [picked, setPicked] = useState<Picked | null>(null);
    const [dragging, setDragging] = useState(false);
    const [brush, setBrush] = useState(DEFAULT_BRUSH_SIZE);
    const [strokes, setStrokes] = useState<readonly MaskStroke[]>([]);
    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const [working, setWorking] = useState(false);
    const [result, setResult] = useState<Cleaned | null>(null);
    const [failure, setFailure] = useState<WatermarkFailureReason | null>(null);

    // Revoking on the way out rather than in the picker: the cleanup fires both
    // when the preview is replaced and when the page is left, so there is one
    // rule instead of one per exit.
    useEffect(() => {
        const url = picked?.url;

        return () => {
            if (url) {
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

    const configured = siteKey !== null;
    const challengeReady = token !== null;
    const checked = picked === null ? null : checkImageFile(picked.file, IMAGE_FILE_LIMITS);
    const painted = hasMaskCoverage(strokes);
    const canRemove = configured && challengeReady && checked?.ok === true && painted && !working;
    const stale = result !== null && (result.facts !== picked?.facts || result.strokes !== strokes);

    function describeFailure(reason: WatermarkFailureReason): string {
        switch (reason) {
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_IMAGE_BYTES) });
            case "missing_image":
                return tErrors("missing_image");
            case "missing_mask":
                return tErrors("missing_mask");
            case "empty_file":
                return tErrors("empty_file");
            case "unsupported_type":
                return tErrors("unsupported_type");
            case "empty_mask":
                return tErrors("empty_mask");
            case "invalid_request":
                return tErrors("invalid_request");
            case "challenge_required":
                return tErrors("challenge_required");
            case "challenge_failed":
                return tErrors("challenge_failed");
            case "rate_limited":
                return tErrors("rate_limited");
            case "unauthorized":
                return tErrors("unauthorized");
            case "not_configured":
                return tErrors("not_configured");
            case "upstream_unavailable":
                return tErrors("upstream_unavailable");
            case "unreadable_response":
                return tErrors("unreadable_response");
            case "oversized_result":
                return tErrors("oversized_result");
            case "compose_failed":
                return tErrors("compose_failed");
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (!configured) {
            return { tone: "error", message: describeFailure("not_configured") };
        }

        if (working) {
            return { tone: "pending", message: t("working") };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure) };
        }

        if (checked === null) {
            return {
                tone: "idle",
                message: t("pickPrompt", { limit: byteLabel(MAX_IMAGE_BYTES) }),
            };
        }

        if (!checked.ok) {
            return { tone: "error", message: describeFailure(checked.reason) };
        }

        if (!painted) {
            return { tone: "idle", message: t("paintPrompt") };
        }

        if (challengeFailed) {
            return { tone: "warning", message: t("challengeFailed") };
        }

        if (!challengeReady) {
            return { tone: "pending", message: t("challengePending") };
        }

        return stale
            ? { tone: "warning", message: t("resultStale") }
            : { tone: "success", message: t("readyToRemove") };
    }

    /** A Turnstile token is single-use, so every attempt draws a fresh one. */
    function renewChallenge() {
        setToken(null);
        setResetSignal((current) => current + 1);
    }

    async function handlePick(file: File | undefined) {
        if (file === undefined || working) {
            return;
        }

        const url = URL.createObjectURL(file);
        const element = await loadImageElement(url);

        if (element === null) {
            // Nothing can be painted over a picture the browser will not decode,
            // so this one is refused here rather than at the worker.
            URL.revokeObjectURL(url);
            setFailure("unsupported_type");
            toast.error(describeFailure("unsupported_type"));

            return;
        }

        setPicked({
            file,
            url,
            element,
            facts: {
                name: file.name,
                type: normalizeImageType(file.type),
                bytes: file.size,
                width: element.naturalWidth,
                height: element.naturalHeight,
            },
        });
        setStrokes([]);
        setResult(null);
        setFailure(null);
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        void handlePick(event.dataTransfer.files[0]);
    }

    function fail(reason: WatermarkFailureReason) {
        setResult(null);
        setFailure(reason);
        toast.error(describeFailure(reason));
    }

    async function handleRemove() {
        if (picked === null || token === null || !canRemove) {
            return;
        }

        const size = { width: picked.facts.width, height: picked.facts.height };
        const region = planRemovalRegion(strokes, size);

        if (region === null) {
            return;
        }

        setWorking(true);
        setFailure(null);

        try {
            const [crop, mask] = await Promise.all([
                cropRegionToModelPng(picked.element, region),
                renderModelMaskPng(strokes, region),
            ]);

            if (crop === null || mask === null) {
                logEvent("error", "watermark_remover.crop_failed");
                fail("compose_failed");

                return;
            }

            const body = new FormData();

            body.set(IMAGE_FORM_FIELD, new File([crop], "crop.png", { type: "image/png" }));
            body.set(MASK_FORM_FIELD, new File([mask], "mask.png", { type: "image/png" }));
            body.set(TOKEN_FORM_FIELD, token);

            const response = await removeWatermark(body);

            if (!response.ok) {
                logEvent("warn", "watermark_remover.removal_failed", { reason: response.reason });
                fail(response.reason);

                return;
            }

            const patch = await loadImageElement(response.patch.dataUrl);

            if (patch === null) {
                logEvent("error", "watermark_remover.patch_undecodable");
                fail("unreadable_response");

                return;
            }

            const composed = await composeCleanedImage({
                source: picked.element,
                size,
                patch,
                strokes,
                region,
            });

            if (composed === null) {
                logEvent("error", "watermark_remover.compose_failed");
                fail("compose_failed");

                return;
            }

            setResult({
                url: URL.createObjectURL(composed),
                beforeUrl: URL.createObjectURL(picked.file),
                blob: composed,
                facts: picked.facts,
                strokes,
            });
            toast.success(tToast("removed"));
        } catch (caught) {
            logEvent("error", "watermark_remover.action_threw", { error: describeError(caught) });
            fail("upstream_unavailable");
        } finally {
            setWorking(false);
            renewChallenge();
        }
    }

    function handleClear() {
        setPicked(null);
        setStrokes([]);
        setResult(null);
        setFailure(null);
    }

    function handleDownload(current: Cleaned) {
        const download = {
            filename: buildCleanImageFilename(current.facts.name, new Date()),
            blob: current.blob,
        };

        try {
            saveBlob(download);
            toast.success(tToast("downloaded", { filename: download.filename }));
        } catch (caught) {
            logEvent("error", "watermark_remover.download_failed", {
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
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
                        accept={IMAGE_ACCEPT_ATTRIBUTE}
                        disabled={working}
                        aria-describedby={hintId}
                        onChange={(event) => void handlePick(event.target.files?.[0])}
                        // Focusable but not laid out, so the label below can be
                        // the whole target while the keyboard still reaches it.
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
                        <IconPhotoUp
                            className="text-muted-foreground size-7"
                            stroke={1.6}
                            aria-hidden="true"
                        />
                        <span className="text-[0.9375rem] leading-[1.4] font-medium">
                            {t("dropTitle")}
                        </span>
                        <span className="text-muted-foreground text-[0.8125rem] leading-normal">
                            {t("dropHint", { limit: byteLabel(MAX_IMAGE_BYTES) })}
                        </span>
                    </label>

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                {picked !== null && checked?.ok === true && (
                    <div className="flex min-w-0 flex-col gap-3">
                        <MaskCanvas
                            // Keyed on the file, so a new pick starts with the
                            // keyboard crosshair back at the centre of the new
                            // picture rather than wherever it was on the last.
                            key={picked.url}
                            url={picked.url}
                            facts={picked.facts}
                            alt={t("previewAlt", { name: picked.facts.name })}
                            strokes={strokes}
                            brush={brush}
                            disabled={working}
                            label={t("canvasLabel")}
                            describedById={canvasHintId}
                            onStrokesChange={setStrokes}
                        />

                        <p
                            id={canvasHintId}
                            className="text-muted-foreground text-[0.6875rem] leading-normal"
                        >
                            {t("canvasHint")}
                        </p>

                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span
                                    id={brushId}
                                    className="text-muted-foreground shrink-0 text-[0.8125rem] leading-[1.4]"
                                >
                                    {t("brush")}
                                </span>
                                <Slider
                                    aria-labelledby={brushId}
                                    value={brush}
                                    min={MIN_BRUSH_SIZE}
                                    max={MAX_BRUSH_SIZE}
                                    disabled={working}
                                    onValueChange={(next) =>
                                        setBrush(
                                            clampBrushSize(
                                                Array.isArray(next) ? (next[0] ?? brush) : next,
                                            ),
                                        )
                                    }
                                    className="min-w-0 flex-1"
                                />
                                <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums">
                                    {brush}
                                </span>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setStrokes(dropLastStroke(strokes))}
                                    disabled={!painted || working}
                                    className="h-8 px-3 text-[0.8125rem]"
                                >
                                    <IconArrowBackUp
                                        className="size-4"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("undo")}
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={() => setStrokes([])}
                                    disabled={!painted || working}
                                    className="h-8 px-3 text-[0.8125rem]"
                                >
                                    <IconEraser
                                        className="size-4"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("clearMask")}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {siteKey !== null && (
                    // Reserves the widget's height so the buttons below do not
                    // jump once Cloudflare's script finishes loading.
                    <div className="min-h-16 w-full max-w-82 min-w-0">
                        <TurnstileWidget
                            siteKey={siteKey}
                            action={TURNSTILE_ACTION}
                            resetSignal={resetSignal}
                            onVerify={(next) => {
                                setToken(next);
                                setChallengeFailed(false);
                            }}
                            onExpire={renewChallenge}
                            onError={() => {
                                setToken(null);
                                setChallengeFailed(true);
                            }}
                        />
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

                    <Button
                        variant="outline"
                        onClick={handleClear}
                        disabled={picked === null || working}
                        className="h-9 px-3.5"
                    >
                        <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                </div>

                {result !== null && (
                    <div
                        className={cn(
                            "min-w-0 transition-opacity duration-200",
                            stale && "opacity-55",
                        )}
                    >
                        <CleanedResult
                            beforeUrl={result.beforeUrl}
                            afterUrl={result.url}
                            facts={result.facts}
                            resultBytes={result.blob.size}
                            onDownload={() => handleDownload(result)}
                        />
                    </div>
                )}

                {/*
                 * Stated in the tool, not only in the article underneath: this
                 * repaints a region of a picture, and the reader is the only one
                 * who can know whether they hold the rights to the one in front
                 * of them.
                 */}
                <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                    {t("rightsNote")}
                </p>

                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("privacyNote")}
                </p>
            </CardContent>
        </Card>
    );
}
