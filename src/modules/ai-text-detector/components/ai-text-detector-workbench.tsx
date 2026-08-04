"use client";

import { IconLoader2, IconTextScan2, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { detectAiText } from "../actions/detect-text";
import {
    MAX_DETECTION_TEXT_LENGTH,
    MAX_REPORTED_BLOCKED_WORDS,
    MIN_DETECTION_TEXT_LENGTH,
    TURNSTILE_ACTION,
} from "../domain/constants";
import { createDetectionExportFile } from "../domain/export";
import { findBlockedWords, maskBlockedWord } from "../domain/profanity";
import { charactersRemaining, checkDetectionText } from "../domain/text-check";
import { getTextMetrics } from "../domain/text-metrics";
import type { DetectionFailureReason, DetectionVerdict, TextMetrics } from "../types";
import { DetectionVerdictPanel } from "./detection-verdict";

const METRIC_KEYS = [
    "characters",
    "words",
    "sentences",
    "averageSentenceWords",
    "uniqueWordRatio",
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

/** Everything an answer is about, so a later edit cannot rewrite its context. */
type Analysis = {
    readonly text: string;
    readonly metrics: TextMetrics;
    readonly verdict: DetectionVerdict;
};

type AiTextDetectorWorkbenchProps = {
    initialText: string;
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables the tool. */
    siteKey: string | null;
};

export function AiTextDetectorWorkbench({ initialText, siteKey }: AiTextDetectorWorkbenchProps) {
    const t = useTranslations("aiTextDetector.workbench");
    const tLabels = useTranslations("aiTextDetector.labels");
    const tMetrics = useTranslations("aiTextDetector.metrics");
    const tErrors = useTranslations("aiTextDetector.errors");
    const tToast = useTranslations("aiTextDetector.toast");
    const formatter = useFormatter();

    const inputId = useId();
    const hintId = useId();

    const [text, setText] = useState(initialText);
    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const [checking, setChecking] = useState(false);
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [failure, setFailure] = useState<DetectionFailureReason | null>(null);
    const [copied, setCopied] = useCopyFeedback<"verdict">();
    const { ref: resultRef, scrollToResult } = useResultScroll();

    // Counting settles with the typing rather than re-measuring the passage on
    // every keystroke — and the button gates on the same value, so the strip
    // and the control can never disagree by a character.
    const settledText = useDebouncedValue(text);
    const settling = settledText !== text;

    const metrics = getTextMetrics(settledText);
    const checked = checkDetectionText(settledText);
    const blocked = findBlockedWords(settledText);

    const configured = siteKey !== null;
    const challengeReady = token !== null;
    const canAnalyse =
        configured && challengeReady && checked.ok && blocked.length === 0 && !checking;
    const stale = analysis !== null && analysis.text !== settledText.trim();

    function formatMetric(key: MetricKey): string {
        if (key === "uniqueWordRatio") {
            return formatter.number(metrics.uniqueWordRatio / 100, { style: "percent" });
        }

        if (key === "averageSentenceWords") {
            return formatter.number(metrics.averageSentenceWords, { maximumFractionDigits: 1 });
        }

        return formatter.number(metrics[key]);
    }

    /**
     * Exhaustive rather than `tErrors(reason)`: two of the reasons carry an ICU
     * argument, and a union key would let a missing one through the type check.
     */
    function describeFailure(reason: DetectionFailureReason): string {
        switch (reason) {
            case "too_short":
                return tErrors("too_short", { min: MIN_DETECTION_TEXT_LENGTH });
            case "too_long":
                return tErrors("too_long", { limit: MAX_DETECTION_TEXT_LENGTH });
            case "empty":
                return tErrors("empty");
            case "blocked_language":
                return tErrors("blocked_language");
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

        // Ahead of the length check: a blocked word is a hard stop the reader
        // has to fix either way, so saying "30 more characters needed" first
        // would just send them down a path that ends here.
        if (blocked.length > 0) {
            return {
                tone: "error",
                message: t("blockedWords", {
                    count: blocked.length,
                    words: blocked
                        .slice(0, MAX_REPORTED_BLOCKED_WORDS)
                        .map((entry) => maskBlockedWord(entry.match))
                        .join(", "),
                }),
            };
        }

        if (!checked.ok) {
            return checked.reason === "too_long"
                ? { tone: "error", message: describeFailure("too_long") }
                : {
                      tone: "idle",
                      message: t("charactersNeeded", {
                          count: charactersRemaining(settledText),
                          min: MIN_DETECTION_TEXT_LENGTH,
                      }),
                  };
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

    async function handleAnalyse() {
        if (checking || !configured || token === null || !checked.ok || blocked.length > 0) {
            return;
        }

        setChecking(true);
        setFailure(null);

        try {
            const result = await detectAiText({ text: checked.text, token });

            if (!result.ok) {
                setAnalysis(null);
                setFailure(result.reason);
                logEvent("warn", "ai_text_detector.analysis_failed", { reason: result.reason });
                toast.error(describeFailure(result.reason));

                return;
            }

            setAnalysis({ text: checked.text, metrics, verdict: result.verdict });
            scrollToResult();
            toast.success(tToast("analysed"));
        } catch (caught) {
            setAnalysis(null);
            setFailure("upstream_unavailable");
            logEvent("error", "ai_text_detector.action_threw", { error: describeError(caught) });
            toast.error(describeFailure("upstream_unavailable"));
        } finally {
            setChecking(false);
            renewChallenge();
        }
    }

    function handleClear() {
        setText("");
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
                confidence: current.verdict.confidence,
            }),
            current.verdict.reasoning,
            t("copyMetrics", {
                words: current.metrics.words,
                sentences: current.metrics.sentences,
            }),
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
        const file = createDetectionExportFile({
            text: current.text,
            verdict: current.verdict,
            metrics: current.metrics,
            generatedAt: new Date(),
        });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "ai_text_detector.download_failed", {
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("inputLabel")}</span>
                        </Label>
                        <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                            {t("characterCount", {
                                count: metrics.characters,
                                max: MAX_DETECTION_TEXT_LENGTH,
                            })}
                        </span>
                    </div>

                    <Textarea
                        id={inputId}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={t("placeholder")}
                        aria-describedby={hintId}
                        aria-invalid={
                            blocked.length > 0 || (!checked.ok && checked.reason === "too_long")
                        }
                        disabled={checking}
                        spellCheck={false}
                        className="max-h-112 min-h-44 resize-y text-sm leading-6"
                    />

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                <dl
                    aria-label={t("metricsLabel")}
                    className={cn(
                        "grid grid-cols-2 gap-2 transition-opacity duration-200 sm:grid-cols-3 lg:grid-cols-5",
                        settling && "opacity-55",
                    )}
                >
                    {METRIC_KEYS.map((key) => (
                        <div
                            key={key}
                            className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset"
                        >
                            <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {tMetrics(key)}
                            </dt>
                            <dd className="font-mono text-sm tabular-nums">{formatMetric(key)}</dd>
                        </div>
                    ))}
                </dl>

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
                            <IconTextScan2 className="size-4" stroke={1.9} aria-hidden="true" />
                        )}
                        {checking ? t("analysing") : t("analyse")}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={handleClear}
                        disabled={text.length === 0 || checking}
                        className="h-9 px-3.5"
                    >
                        <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                </div>

                {analysis !== null && (
                    <div
                        ref={resultRef}
                        className={cn(
                            "min-w-0 transition-opacity duration-200",
                            stale && "opacity-55",
                        )}
                    >
                        <DetectionVerdictPanel
                            verdict={analysis.verdict}
                            copied={copied === "verdict"}
                            onCopy={() => void handleCopyVerdict(analysis)}
                            onDownload={() => handleDownload(analysis)}
                        />
                    </div>
                )}

                <p className="text-muted-foreground text-[0.6875rem] leading-[1.5]">
                    {t("privacyNote")}
                </p>
            </CardContent>
        </Card>
    );
}
