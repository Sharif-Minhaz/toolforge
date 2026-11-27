"use client";

import {
    IconAlertTriangle,
    IconClipboardText,
    IconDownload,
    IconInfoCircle,
    IconLoader2,
    IconRuler,
    IconShare,
    IconWorldWww,
    IconX,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { ScanRadar } from "@/modules/tools/components/scan-radar";
import { SegmentedControl } from "@/modules/tools/components/segmented-control";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { StepLabel } from "@/modules/tools/components/workbench-step";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { checkPublicUrl } from "@/modules/tools/domain/public-url";

import { inspectLink, probeLinkImage } from "../actions/inspect-link";
import { analyzePreview } from "../domain/analyze";
import { MAX_PASTED_HTML_LENGTH, MAX_URL_LENGTH } from "../domain/constants";
import { PREVIEW_PLATFORMS, type PreviewPlatform } from "../domain/platforms";
import { buildRecommendedHead } from "../domain/snippet";
import { readPreviewTags } from "../domain/tags";
import { normalizeTypedUrl, picturesToProbe } from "../domain/urls";
import type {
    ImageProbe,
    InspectionFailure,
    PreviewAllowance,
    PreviewAnalysis,
    PreviewReport,
    PreviewTags,
} from "../types";
import type { PreviewMode } from "../validation/preview-request";
import { FindingsList } from "./findings-list";
import { PlatformCard } from "./platform-card";
import { TagTable } from "./tag-table";

/** Complaints about the address itself, which belong beside the field. */
const INPUT_FAILURES: readonly InspectionFailure[] = ["invalid_url", "scheme_not_allowed"];

/** A small, honest example for the paste box: every tag a card reads, one of them wrong. */
const EXAMPLE_HEAD = `<head>
  <title>Release notes — Example</title>
  <meta name="description" content="What changed in version 2.0, and how to upgrade.">
  <meta property="og:title" content="Release notes for 2.0">
  <meta property="og:description" content="What changed, and how to upgrade.">
  <meta property="og:image" content="/images/release-2.png">
  <meta property="og:site_name" content="Example">
  <meta name="twitter:card" content="summary_large_image">
</head>`;

type LinkPreviewWorkbenchProps = {
    /** From `?url=`: fills the box, never runs the check. */
    initialUrl: string;
    initialMode: PreviewMode;
    /** False when this deployment cannot meter fetches and so will not run any. */
    configured: boolean;
};

type View = {
    readonly analysis: PreviewAnalysis;
    readonly tags: PreviewTags;
    readonly pageUrl: URL | null;
    readonly images: readonly ImageProbe[];
};

export function LinkPreviewWorkbench({
    initialUrl,
    initialMode,
    configured,
}: LinkPreviewWorkbenchProps) {
    const t = useTranslations("linkPreview.workbench");
    const tModes = useTranslations("linkPreview.modes");
    const tPlatforms = useTranslations("linkPreview.platforms");
    const tErrors = useTranslations("linkPreview.errors");
    const tToast = useTranslations("linkPreview.toast");
    const format = useFormatter();

    const modeLabelId = useId();
    const urlId = useId();
    const htmlId = useId();
    const baseId = useId();
    const statusId = useId();

    const [mode, setMode] = useState<PreviewMode>(initialMode);

    const [url, setUrl] = useState(initialUrl);
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState<PreviewReport | null>(null);
    const [failure, setFailure] = useState<InspectionFailure | null>(null);
    const [allowance, setAllowance] = useState<PreviewAllowance | null>(null);

    const [html, setHtml] = useState("");
    const [base, setBase] = useState("");
    const [probes, setProbes] = useState<readonly ImageProbe[]>([]);
    const [measuring, setMeasuring] = useState(false);

    const { ref: resultRef, scrollToResult } = useResultScroll();

    // Debounced: re-reading a pasted head and re-running eight platforms'
    // rules is the expensive derivation decision 43 debounces. The editor
    // itself is never debounced — it paints behind the caret.
    const settledHtml = useDebouncedValue(html);
    const settledBase = useDebouncedValue(base);
    const pasteLimit = useInputLimit(html.length, MAX_PASTED_HTML_LENGTH);
    const pasteTooLong = settledHtml.length > MAX_PASTED_HTML_LENGTH;
    const pasteStale = html !== settledHtml || base !== settledBase;

    const typedBase = settledBase.trim();
    const baseCheck = typedBase.length === 0 ? null : checkPublicUrl(normalizeTypedUrl(typedBase));
    const baseUrl = baseCheck !== null && baseCheck.ok ? baseCheck.url : null;
    const baseInvalid = baseCheck !== null && !baseCheck.ok;

    // Memoised on the settled text alone: a megabyte of markup is worth
    // reading once per pause, not once per render the island does for any
    // other reason (a toast, the measuring spinner).
    const pastedTags = useMemo(
        () =>
            settledHtml.trim().length === 0 || pasteTooLong ? null : readPreviewTags(settledHtml),
        [settledHtml, pasteTooLong],
    );

    const view: View | null =
        mode === "fetch"
            ? report === null
                ? null
                : fetchedView(report)
            : pastedTags === null
              ? null
              : {
                    tags: pastedTags,
                    pageUrl: baseUrl,
                    images: probes,
                    analysis: analyzePreview({
                        tags: pastedTags,
                        pageUrl: baseUrl,
                        page: null,
                        images: probes,
                    }),
                };

    const unmeasured =
        mode === "paste" && pastedTags !== null
            ? picturesToProbe(pastedTags, baseUrl).filter(
                  (address) => !probes.some((probe) => probe.url === address),
              )
            : [];

    const exhausted = allowance !== null && allowance.remaining <= 0;
    const canCheck = configured && !running && url.trim().length > 0 && !exhausted;
    const canMeasure = configured && !measuring && unmeasured.length > 0 && !exhausted;

    const platformName = (platform: PreviewPlatform) => tPlatforms(platform);

    function counts(analysis: PreviewAnalysis) {
        const errors = analysis.findings.filter((entry) => entry.severity === "error").length;
        const warnings = analysis.findings.filter((entry) => entry.severity === "warning").length;

        return { errors, warnings, notes: analysis.findings.length - errors - warnings };
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (mode === "paste") {
            if (pasteTooLong) {
                return { tone: "error", message: t("pasteTooLong") };
            }

            if (view === null) {
                return { tone: "idle", message: t("statusPasteIdle") };
            }

            const { errors, warnings } = counts(view.analysis);

            return {
                tone: errors > 0 ? "error" : warnings > 0 ? "warning" : "success",
                message: t("statusDone", { errors, warnings }),
            };
        }

        if (!configured) {
            return { tone: "error", message: t("quotaUnavailable") };
        }

        if (running) {
            return { tone: "pending", message: t("statusChecking") };
        }

        if (failure !== null) {
            return { tone: "error", message: tErrors(failure) };
        }

        if (view !== null) {
            const { errors, warnings } = counts(view.analysis);

            return {
                tone: errors > 0 ? "error" : warnings > 0 ? "warning" : "success",
                message: t("statusDone", { errors, warnings }),
            };
        }

        return { tone: "idle", message: t("statusIdle") };
    }

    async function handleCheck() {
        if (!canCheck) {
            return;
        }

        const target = normalizeTypedUrl(url);
        const shape = checkPublicUrl(target);

        // Checked here as well as on the server, because everything past this
        // line spends one of a small allowance and moves the page to a result
        // area that a typo would never fill.
        if (!shape.ok) {
            setReport(null);
            setFailure(shape.reason);

            return;
        }

        // The previous result goes now, not when the next one lands: cards for
        // one page under an address box naming another are a lie.
        setReport(null);
        setFailure(null);
        setRunning(true);
        scrollToResult();

        try {
            const result = await inspectLink({ url: shape.url.toString() });

            if (result.allowance !== undefined) {
                setAllowance(result.allowance);
            }

            if (!result.ok) {
                setFailure(result.reason);
                logEvent("warn", "link_preview.failed", { reason: result.reason });
                toast.error(tErrors(result.reason));

                return;
            }

            setReport({
                page: result.page,
                tags: result.tags,
                images: result.images,
                fetchedAt: result.fetchedAt,
            });
        } catch (caught) {
            setFailure("upstream_failed");
            logEvent("error", "link_preview.action_threw", { error: describeError(caught) });
            toast.error(tErrors("upstream_failed"));
        } finally {
            setRunning(false);
        }
    }

    async function handleMeasure() {
        if (!canMeasure) {
            return;
        }

        setMeasuring(true);

        try {
            const measured: ImageProbe[] = [];

            for (const address of unmeasured) {
                const result = await probeLinkImage({ url: address });

                if (result.allowance !== undefined) {
                    setAllowance(result.allowance);
                }

                if (!result.ok) {
                    toast.error(tErrors(result.reason));
                    break;
                }

                measured.push(result.probe);
            }

            setProbes((current) => [...current, ...measured]);
        } catch (caught) {
            logEvent("error", "link_preview.probe_threw", { error: describeError(caught) });
            toast.error(tToast("measureFailed"));
        } finally {
            setMeasuring(false);
        }
    }

    function reportCopyFailure(result: Extract<CopyResult, { ok: false }>) {
        toast.error(
            result.reason === "empty"
                ? tToast("copyFailedEmpty")
                : result.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied"),
        );
    }

    const snippet =
        view === null
            ? ""
            : buildRecommendedHead({
                  tags: view.tags,
                  pageUrl: view.pageUrl,
                  images: view.images,
                  placeholders: {
                      title: t("placeholderTitle"),
                      description: t("placeholderDescription"),
                      image: t("placeholderImage"),
                      imageAlt: t("placeholderImageAlt"),
                  },
              });

    async function handleCopySnippet() {
        const result = await copyText(snippet);

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownloadSnippet() {
        const file = {
            filename: "preview-tags.html",
            mimeType: "text/html",
            content: `${snippet}\n`,
        };

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "link_preview.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const status = describeStatus();
    const showComplaintHere =
        mode === "fetch" && failure !== null && INPUT_FAILURES.includes(failure);
    const tally = view === null ? null : counts(view.analysis);

    return (
        <div className={cn("flex flex-col gap-6", TOOL_ACCENT_VARS.violet)}>
            <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                <CardContent className="flex flex-col gap-5">
                    <p className="text-muted-foreground text-sm">{t("description")}</p>

                    <div className="flex flex-col gap-2">
                        <span id={modeLabelId} className="text-muted-foreground text-xs">
                            {t("modeLabel")}
                        </span>
                        <SegmentedControl
                            labelId={modeLabelId}
                            layoutId="link-preview-mode"
                            value={mode}
                            onChange={setMode}
                            options={[
                                { value: "fetch", label: tModes("fetch"), Icon: IconWorldWww },
                                { value: "paste", label: tModes("paste"), Icon: IconClipboardText },
                            ]}
                        />
                    </div>

                    {mode === "fetch" ? (
                        <>
                            {/* Rule 32: the page and its picture are fetched by
                                this server, so the reader is told before the
                                controls, not in the article. */}
                            <div className="bg-muted/40 ring-border flex items-start gap-2.5 rounded-xl px-3.5 py-3 ring-1 ring-inset">
                                <IconInfoCircle
                                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                                    stroke={1.75}
                                    aria-hidden="true"
                                />
                                <div className="flex min-w-0 flex-col gap-1">
                                    <p className="text-[0.8125rem] leading-[1.4] font-medium">
                                        {t("disclosureTitle")}
                                    </p>
                                    <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                                        {t("disclosure")}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <StepLabel step={1} htmlFor={urlId}>
                                    {t("urlLabel")}
                                </StepLabel>
                                <Input
                                    id={urlId}
                                    // Capped: an address is a short identity
                                    // field, and nothing longer is a page anyone
                                    // shares.
                                    maxLength={MAX_URL_LENGTH}
                                    value={url}
                                    type="url"
                                    inputMode="url"
                                    spellCheck={false}
                                    autoCapitalize="off"
                                    autoComplete="url"
                                    autoCorrect="off"
                                    placeholder={t("urlPlaceholder")}
                                    aria-describedby={statusId}
                                    onChange={(event) => setUrl(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            void handleCheck();
                                        }
                                    }}
                                    className="h-11 font-mono text-base md:text-base"
                                />
                                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("urlHint")}
                                </p>

                                {showComplaintHere && failure !== null && (
                                    <p
                                        role="alert"
                                        className="text-destructive flex items-start gap-2 text-[0.8125rem] leading-relaxed"
                                    >
                                        <IconAlertTriangle
                                            className="mt-0.5 size-4 shrink-0"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                        {tErrors(failure)}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <Button onClick={handleCheck} disabled={!canCheck}>
                                    {running ? (
                                        <IconLoader2
                                            className="size-4 animate-spin"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <IconShare
                                            className="size-4"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {running ? t("checking") : t("check")}
                                </Button>
                                <AllowancePill allowance={allowance} exhausted={exhausted} />
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-muted-foreground bg-muted/40 ring-border rounded-xl px-3.5 py-3 text-[0.8125rem] leading-relaxed ring-1 ring-inset">
                                {t("pasteNote")}
                            </p>

                            <div className="flex flex-col gap-2">
                                <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                                    <StepLabel step={1} htmlFor={htmlId}>
                                        {t("pasteLabel")}
                                    </StepLabel>
                                    <div className="flex items-center gap-1.5">
                                        <InputLimitMeter reading={pasteLimit} className="mr-1" />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setHtml(EXAMPLE_HEAD);
                                                setBase("https://example.com/releases/2.0");
                                            }}
                                        >
                                            {t("example")}
                                        </Button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setHtml("");
                                                setProbes([]);
                                            }}
                                            disabled={html.length === 0}
                                            aria-label={t("clear")}
                                            className={cn(
                                                buttonVariants({
                                                    variant: "ghost",
                                                    size: "icon-sm",
                                                }),
                                                "text-muted-foreground hover:text-foreground",
                                            )}
                                        >
                                            <IconX
                                                className="size-4"
                                                stroke={1.9}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </div>
                                </div>
                                {/* Never capped (rule 9): a truncated head is a
                                    different head. The meter counts, the
                                    complaint sits under the box, and the
                                    analysis stops instead. */}
                                <CodeEditor
                                    id={htmlId}
                                    value={html}
                                    language="html"
                                    placeholder={t("pastePlaceholder")}
                                    ariaDescribedBy={statusId}
                                    onChange={setHtml}
                                />
                                {pasteTooLong && (
                                    <p
                                        role="alert"
                                        className="text-destructive text-[0.8125rem] leading-relaxed"
                                    >
                                        {t("pasteTooLong")}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={baseId} className="text-muted-foreground text-xs">
                                    <span className="leading-[1.3]">{t("baseLabel")}</span>
                                </Label>
                                <Input
                                    id={baseId}
                                    maxLength={MAX_URL_LENGTH}
                                    value={base}
                                    spellCheck={false}
                                    autoCapitalize="off"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    placeholder={t("basePlaceholder")}
                                    onChange={(event) => setBase(event.target.value)}
                                    className="font-mono text-[0.8125rem]"
                                />
                                <p
                                    className={cn(
                                        "text-[0.6875rem] leading-[1.4]",
                                        baseInvalid ? "text-destructive" : "text-muted-foreground",
                                    )}
                                >
                                    {baseInvalid ? t("baseInvalid") : t("baseHint")}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    variant="outline"
                                    onClick={handleMeasure}
                                    disabled={!canMeasure}
                                >
                                    {measuring ? (
                                        <IconLoader2
                                            className="size-4 animate-spin"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <IconRuler
                                            className="size-4"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {measuring
                                        ? t("measuring")
                                        : t("measure", { count: unmeasured.length })}
                                </Button>
                                <AllowancePill allowance={allowance} exhausted={exhausted} />
                                <p className="text-muted-foreground w-full text-[0.6875rem] leading-[1.4]">
                                    {configured ? t("measureHint") : t("measureUnavailable")}
                                </p>
                            </div>
                        </>
                    )}

                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        className="[&>span]:min-w-0 [&>span]:wrap-break-word"
                    />
                </CardContent>
            </Card>

            <div ref={resultRef} className="scroll-mt-6">
                {mode === "fetch" && running && (
                    <ScanRadar
                        label={normalizeTypedUrl(url)}
                        captions={[t("statusChecking")]}
                        restingCaption={t("statusChecking")}
                    />
                )}

                {!(mode === "fetch" && running) && view !== null && tally !== null && (
                    <Card
                        className={cn(
                            "[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]",
                            mode === "paste" && pasteStale && "opacity-55 transition-opacity",
                        )}
                    >
                        <CardHeader>
                            <StepLabel step={2}>{t("resultsTitle")}</StepLabel>
                            {mode === "fetch" && report !== null && (
                                <CardDescription className="flex flex-col gap-0.5 font-mono text-[0.75rem] break-all">
                                    <span>{report.page.finalUrl}</span>
                                    <span className="text-muted-foreground font-sans">
                                        {t("pageFacts", {
                                            status: report.page.status,
                                            redirects: report.page.hops.length - 1,
                                            charset: report.page.charset,
                                            time: format.dateTime(new Date(report.fetchedAt), {
                                                timeStyle: "medium",
                                            }),
                                        })}
                                    </span>
                                </CardDescription>
                            )}
                        </CardHeader>

                        <CardContent className="flex flex-col gap-8">
                            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
                                {(
                                    [
                                        ["tallyErrors", tally.errors],
                                        ["tallyWarnings", tally.warnings],
                                        ["tallyNotes", tally.notes],
                                    ] as const
                                ).map(([key, value]) => (
                                    <div
                                        key={key}
                                        className="bg-card/60 ring-border/70 flex flex-col gap-0.5 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                                    >
                                        <span className="text-lg font-semibold tabular-nums">
                                            {format.number(value)}
                                        </span>
                                        <span className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                                            {t(key)}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <section
                                className="flex flex-col gap-4"
                                aria-labelledby={`${statusId}-cards`}
                            >
                                <h2
                                    id={`${statusId}-cards`}
                                    className="text-[0.9375rem] font-semibold"
                                >
                                    {t("cardsTitle")}
                                </h2>
                                <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
                                    {PREVIEW_PLATFORMS.map((platform) => {
                                        const card = view.analysis.cards.find(
                                            (entry) => entry.platform === platform,
                                        );

                                        return card === undefined ? null : (
                                            <PlatformCard
                                                key={platform}
                                                card={card}
                                                name={platformName(platform)}
                                            />
                                        );
                                    })}
                                </div>
                                <p className="text-muted-foreground/80 text-[0.6875rem] leading-[1.4]">
                                    {t("cardsNote")}
                                </p>
                            </section>

                            <section
                                className="flex flex-col gap-3"
                                aria-labelledby={`${statusId}-findings`}
                            >
                                <h2
                                    id={`${statusId}-findings`}
                                    className="text-[0.9375rem] font-semibold"
                                >
                                    {t("findingsTitle")}
                                </h2>
                                <FindingsList
                                    findings={view.analysis.findings}
                                    platformName={platformName}
                                />
                            </section>

                            <section
                                className="flex flex-col gap-3"
                                aria-labelledby={`${statusId}-snippet`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2
                                        id={`${statusId}-snippet`}
                                        className="text-[0.9375rem] font-semibold"
                                    >
                                        {t("snippetTitle")}
                                    </h2>
                                    <div className="flex items-center gap-1.5">
                                        <Button size="sm" onClick={handleCopySnippet}>
                                            {t("copySnippet")}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleDownloadSnippet}
                                        >
                                            <IconDownload
                                                className="size-3.5"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("downloadSnippet")}
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-muted-foreground text-[0.75rem] leading-relaxed">
                                    {t("snippetHint")}
                                </p>
                                <CodeBlock
                                    code={snippet}
                                    language="html"
                                    className="bg-card max-h-96"
                                />
                            </section>

                            <section
                                className="flex flex-col gap-3"
                                aria-labelledby={`${statusId}-tags`}
                            >
                                <h2
                                    id={`${statusId}-tags`}
                                    className="text-[0.9375rem] font-semibold"
                                >
                                    {t("tagsTitle")}
                                </h2>
                                <TagTable tags={view.tags.tags} />
                            </section>
                        </CardContent>
                    </Card>
                )}

                {/* A complaint about the *check* belongs where the answer would
                    have been; the address complaints are already beside the box. */}
                {mode === "fetch" &&
                    !running &&
                    report === null &&
                    failure !== null &&
                    !showComplaintHere && (
                        <Card className="[--card-spacing:--spacing(5)]">
                            <CardContent>
                                <p
                                    role="alert"
                                    className="text-destructive flex items-start gap-2.5 text-[0.8125rem] leading-relaxed"
                                >
                                    <IconAlertTriangle
                                        className="mt-0.5 size-4 shrink-0"
                                        stroke={1.9}
                                        aria-hidden="true"
                                    />
                                    {tErrors(failure)}
                                </p>
                            </CardContent>
                        </Card>
                    )}
            </div>
        </div>
    );
}

/** The fetch mode's view: derived during render, so a re-render never refetches. */
function fetchedView(report: PreviewReport): View {
    const pageUrl = new URL(report.page.finalUrl);

    return {
        tags: report.tags,
        pageUrl,
        images: report.images,
        analysis: analyzePreview({
            tags: report.tags,
            pageUrl,
            page: report.page,
            images: report.images,
        }),
    };
}

function AllowancePill({
    allowance,
    exhausted,
}: {
    allowance: PreviewAllowance | null;
    exhausted: boolean;
}) {
    const t = useTranslations("linkPreview.workbench");

    if (allowance === null) {
        return null;
    }

    return (
        <span
            className={cn(
                "ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ring-1 ring-inset",
                exhausted
                    ? "text-brand-amber ring-brand-amber/30 bg-brand-amber/8"
                    : "text-muted-foreground ring-border/70 bg-card/70",
            )}
        >
            <span className="leading-[1.3]">
                {t("quotaRemaining", { remaining: allowance.remaining })}
            </span>
        </span>
    );
}
