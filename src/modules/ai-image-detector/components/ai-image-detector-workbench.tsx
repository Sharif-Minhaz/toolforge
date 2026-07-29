"use client";

import { IconLoader2, IconPhotoUp, IconScan, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { readImagePixelSize } from "@/modules/tools/domain/image-element";
import { checkImageFile, normalizeImageType } from "@/modules/tools/domain/image-file";
import { detectAiImage } from "../actions/detect-image";
import {
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FILE_LIMITS,
    IMAGE_FORM_FIELD,
    MAX_IMAGE_BYTES,
    TOKEN_FORM_FIELD,
    TURNSTILE_ACTION,
} from "../domain/constants";
import { createImageReportFile } from "../domain/export";
import type { ImageDetectionFailureReason, ImageFacts, ImageVerdict } from "../types";
import { ImageVerdictPanel } from "./image-verdict";

/** The picked file, its preview, and everything shown about it. */
type Picked = {
    readonly file: File;
    readonly url: string;
    readonly facts: ImageFacts;
};

/** Everything an answer is about, so a later pick cannot rewrite its context. */
type Analysis = {
    readonly facts: ImageFacts;
    readonly verdict: ImageVerdict;
};

type AiImageDetectorWorkbenchProps = {
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables the tool. */
    siteKey: string | null;
};

export function AiImageDetectorWorkbench({ siteKey }: AiImageDetectorWorkbenchProps) {
    const t = useTranslations("aiImageDetector.workbench");
    const tLabels = useTranslations("aiImageDetector.labels");
    const tBands = useTranslations("aiImageDetector.bands");
    const tFacts = useTranslations("aiImageDetector.facts");
    const tErrors = useTranslations("aiImageDetector.errors");
    const tToast = useTranslations("aiImageDetector.toast");
    const formatter = useFormatter();
    const byteLabel = useByteLabel();

    const inputId = useId();
    const hintId = useId();

    const [picked, setPicked] = useState<Picked | null>(null);
    const [dragging, setDragging] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const [checking, setChecking] = useState(false);
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [failure, setFailure] = useState<ImageDetectionFailureReason | null>(null);
    const [copied, setCopied] = useCopyFeedback<"verdict">();

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

    const configured = siteKey !== null;
    const challengeReady = token !== null;
    const checked = picked === null ? null : checkImageFile(picked.file, IMAGE_FILE_LIMITS);
    const canAnalyse = configured && challengeReady && checked?.ok === true && !checking;
    const stale = analysis !== null && picked !== null && analysis.facts !== picked.facts;

    function describeFailure(reason: ImageDetectionFailureReason): string {
        switch (reason) {
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_IMAGE_BYTES) });
            case "missing_image":
                return tErrors("missing_image");
            case "empty_file":
                return tErrors("empty_file");
            case "unsupported_type":
                return tErrors("unsupported_type");
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
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (!configured) {
            return { tone: "error", message: describeFailure("not_configured") };
        }

        if (checking) {
            return { tone: "pending", message: t("analysing") };
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

        if (challengeFailed) {
            return { tone: "warning", message: t("challengeFailed") };
        }

        if (!challengeReady) {
            return { tone: "pending", message: t("challengePending") };
        }

        return stale
            ? { tone: "warning", message: t("verdictStale") }
            : { tone: "success", message: t("readyToAnalyse") };
    }

    /** A Turnstile token is single-use, so every attempt draws a fresh one. */
    function renewChallenge() {
        setToken(null);
        setResetSignal((current) => current + 1);
    }

    async function handlePick(file: File | undefined) {
        if (file === undefined || checking) {
            return;
        }

        const url = URL.createObjectURL(file);
        const size = await readImagePixelSize(url);

        setPicked({
            file,
            url,
            facts: {
                name: file.name,
                type: normalizeImageType(file.type),
                bytes: file.size,
                width: size?.width ?? null,
                height: size?.height ?? null,
            },
        });
        setAnalysis(null);
        setFailure(null);
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        void handlePick(event.dataTransfer.files[0]);
    }

    async function handleAnalyse() {
        if (checking || !configured || token === null || picked === null || checked?.ok !== true) {
            return;
        }

        setChecking(true);
        setFailure(null);

        const body = new FormData();

        body.set(IMAGE_FORM_FIELD, picked.file, picked.file.name);
        body.set(TOKEN_FORM_FIELD, token);

        try {
            const result = await detectAiImage(body);

            if (!result.ok) {
                setAnalysis(null);
                setFailure(result.reason);
                logEvent("warn", "ai_image_detector.analysis_failed", { reason: result.reason });
                toast.error(describeFailure(result.reason));

                return;
            }

            setAnalysis({ facts: picked.facts, verdict: result.verdict });
            toast.success(tToast("analysed"));
        } catch (caught) {
            setAnalysis(null);
            setFailure("upstream_unavailable");
            logEvent("error", "ai_image_detector.action_threw", { error: describeError(caught) });
            toast.error(describeFailure("upstream_unavailable"));
        } finally {
            setChecking(false);
            renewChallenge();
        }
    }

    function handleClear() {
        setPicked(null);
        setAnalysis(null);
        setFailure(null);
    }

    function reportCopyFailure(result: Extract<CopyResult, { ok: false }>) {
        const message =
            result.reason === "empty"
                ? tToast("copyFailedEmpty")
                : result.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function handleCopyVerdict(current: Analysis) {
        const summary = [
            t("copySummary", {
                label: tLabels(current.verdict.label),
                band: tBands(current.verdict.band),
            }),
            current.verdict.reasoning,
            t("copyImage", { name: current.facts.name, size: byteLabel(current.facts.bytes) }),
        ]
            .filter((line) => line.length > 0)
            .join("\n");

        const result = await copyText(summary);

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        setCopied("verdict");
        toast.success(tToast("copied"));
    }

    function handleDownload(current: Analysis) {
        const file = createImageReportFile({
            facts: current.facts,
            verdict: current.verdict,
            generatedAt: new Date(),
        });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "ai_image_detector.download_failed", {
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
                        disabled={checking}
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
                        <span className="text-muted-foreground text-[0.8125rem] leading-[1.5]">
                            {t("dropHint", { limit: byteLabel(MAX_IMAGE_BYTES) })}
                        </span>
                    </label>

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                {picked !== null && (
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
                        {/*
                         * A plain `<img>`, deliberately: the source is an object
                         * URL for a file the reader just chose, so there is no
                         * origin to allowlist and nothing for `next/image` to
                         * optimise.
                         */}
                        <img
                            src={picked.url}
                            alt={t("previewAlt", { name: picked.facts.name })}
                            decoding="async"
                            className="ring-border/70 bg-muted/40 h-40 w-full shrink-0 rounded-xl object-contain ring-1 ring-inset sm:w-56"
                        />

                        <dl
                            aria-label={t("factsLabel")}
                            className="grid min-w-0 flex-1 grid-cols-2 gap-2"
                        >
                            <div className="bg-card/60 ring-border/70 col-span-2 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                                <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {tFacts("name")}
                                </dt>
                                <dd className="truncate font-mono text-sm">{picked.facts.name}</dd>
                            </div>

                            <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                                <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {tFacts("size")}
                                </dt>
                                <dd className="font-mono text-sm tabular-nums">
                                    {byteLabel(picked.facts.bytes)}
                                </dd>
                            </div>

                            <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                                <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {tFacts("type")}
                                </dt>
                                <dd className="truncate font-mono text-sm">
                                    {picked.facts.type || tFacts("typeUnknown")}
                                </dd>
                            </div>

                            <div className="bg-card/60 ring-border/70 col-span-2 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                                <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {tFacts("dimensions")}
                                </dt>
                                <dd className="font-mono text-sm tabular-nums">
                                    {picked.facts.width !== null && picked.facts.height !== null
                                        ? tFacts("pixels", {
                                              width: formatter.number(picked.facts.width),
                                              height: formatter.number(picked.facts.height),
                                          })
                                        : tFacts("dimensionsUnknown")}
                                </dd>
                            </div>
                        </dl>
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
                        onClick={() => void handleAnalyse()}
                        disabled={!canAnalyse}
                        className="h-9 px-3.5"
                    >
                        {checking ? (
                            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <IconScan className="size-4" stroke={1.9} aria-hidden="true" />
                        )}
                        {checking ? t("analysing") : t("analyse")}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={handleClear}
                        disabled={picked === null || checking}
                        className="h-9 px-3.5"
                    >
                        <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                </div>

                {analysis !== null && (
                    <div
                        className={cn(
                            "min-w-0 transition-opacity duration-200",
                            stale && "opacity-55",
                        )}
                    >
                        <ImageVerdictPanel
                            verdict={analysis.verdict}
                            copied={copied === "verdict"}
                            onCopy={() => void handleCopyVerdict(analysis)}
                            onDownload={() => handleDownload(analysis)}
                        />
                    </div>
                )}

                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("privacyNote")}
                </p>
            </CardContent>
        </Card>
    );
}
