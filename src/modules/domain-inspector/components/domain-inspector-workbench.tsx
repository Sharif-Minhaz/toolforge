"use client";

import {
    IconAlertTriangle,
    IconDownload,
    IconLoader2,
    IconRadar2,
    IconTrash,
    IconWorldSearch,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { inspectDomain } from "../actions/inspect-domain";
import { MAX_INPUT_LENGTH, TURNSTILE_ACTION } from "../domain/constants";
import { checkHostSyntax, type HostSyntaxFailure } from "@/modules/tools/domain/host-syntax";
import { createDomainReportFile, summarizeReport } from "../domain/export";
import {
    DNS_RESOLVERS,
    type DomainReport,
    type InspectionFailureReason,
    type InspectionOptions,
} from "../types";
import { DomainReportView } from "./report-panels";
import { ScanRadar } from "@/modules/tools/components/scan-radar";

/** The small-caps label the result panels use, so the form matches them. */
const FIELD_LABEL =
    "text-muted-foreground text-[0.625rem] leading-normal tracking-[0.14em] uppercase";

/** The lookups actually in flight, cycled under the sweep. Message keys. */
const SCAN_STAGES = ["dns", "registry", "network", "tls", "page"] as const;

const SYNTAX_FAILURES: readonly HostSyntaxFailure[] = [
    "empty_input",
    "too_long",
    "invalid_hostname",
];

function isSyntaxFailure(reason: InspectionFailureReason): boolean {
    return SYNTAX_FAILURES.some((candidate) => candidate === reason);
}

type DomainInspectorWorkbenchProps = {
    /** From `?host=`, so a shared link opens on the domain it names. */
    initialHost: string;
    initialOptions: InspectionOptions;
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables the tool. */
    siteKey: string | null;
};

export function DomainInspectorWorkbench({
    initialHost,
    initialOptions,
    siteKey,
}: DomainInspectorWorkbenchProps) {
    const t = useTranslations("domainInspector.workbench");
    const tResolvers = useTranslations("domainInspector.resolvers");
    const tErrors = useTranslations("domainInspector.errors");
    const tToast = useTranslations("domainInspector.toast");
    const tScan = useTranslations("domainInspector.scan");
    const format = useFormatter();

    const inputId = useId();
    const hintId = useId();

    // The lookup is an explicit press, not a derivation, so there is nothing to
    // debounce: no keystroke costs a request, and the 300 ms rule for typed
    // input does not apply to a field whose value is only read on submit.
    const [host, setHost] = useState(initialHost);

    // Caps at `maxLength`, so this never reads "over" — it only counts the
    // last stretch down, which is the half `checkHostSyntax` cannot show.
    const hostLimit = useInputLimit(host.length, MAX_INPUT_LENGTH);
    const [options, setOptions] = useState<InspectionOptions>(initialOptions);
    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState<DomainReport | null>(null);
    const [failure, setFailure] = useState<InspectionFailureReason | null>(null);
    const [copied, setCopied] = useCopyFeedback<"summary">();
    const { ref: resultRef, scrollToResult } = useResultScroll();

    const configured = siteKey !== null;
    const canInspect = configured && token !== null && host.trim().length > 0 && !running;

    function patch(next: Partial<InspectionOptions>) {
        setOptions((current) => ({ ...current, ...next }));
    }

    function renewChallenge() {
        setToken(null);
        setResetSignal((current) => current + 1);
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (!configured) {
            return { tone: "error", message: tErrors("not_configured") };
        }

        if (running) {
            return { tone: "pending", message: t("inspecting") };
        }

        if (failure !== null) {
            return { tone: "error", message: tErrors(failure) };
        }

        if (challengeFailed) {
            return { tone: "warning", message: t("challengeFailed") };
        }

        if (token === null) {
            return { tone: "pending", message: t("challengePending") };
        }

        if (report !== null) {
            return {
                tone: "success",
                message: t("checkedAt", {
                    time: format.dateTime(new Date(report.checkedAt), {
                        timeStyle: "medium",
                    }),
                }),
            };
        }

        return { tone: "idle", message: t("hint") };
    }

    async function handleInspect() {
        if (!canInspect || token === null) {
            return;
        }

        // Checked here rather than only on the server, because everything
        // below this line costs something the reader should not pay for a
        // typo: a Turnstile token, a round trip, and a scroll away from the
        // field they need to fix.
        const syntax = checkHostSyntax(host, MAX_INPUT_LENGTH);

        if (syntax !== null) {
            setReport(null);
            setFailure(syntax);

            return;
        }

        setRunning(true);
        setFailure(null);
        scrollToResult();

        try {
            const result = await inspectDomain({
                token,
                host: host.trim(),
                resolver: options.resolver,
                probeSite: options.probeSite,
            });

            if (!result.ok) {
                setReport(null);
                setFailure(result.reason);
                logEvent("warn", "domain_inspector.failed", { reason: result.reason });
                toast.error(tErrors(result.reason));

                return;
            }

            setReport(result.report);
            toast.success(tToast("done", { host: result.report.breakdown.hostname }));
        } catch (caught) {
            setReport(null);
            setFailure("lookup_failed");
            logEvent("error", "domain_inspector.action_threw", { error: describeError(caught) });
            toast.error(tErrors("lookup_failed"));
        } finally {
            setRunning(false);
            renewChallenge();
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

    async function handleCopy(current: DomainReport) {
        const result = await copyText(summarizeReport(current));

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        setCopied("summary");
        toast.success(tToast("copied"));
    }

    function handleDownload(current: DomainReport) {
        const file = createDomainReportFile(current);

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "domain_inspector.download_failed", {
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    const status = describeStatus();

    // The scan and the report are the same instrument in two states, so the
    // radar keeps the exact slot the summary strip will take.
    const scanning = running && host.trim().length > 0;

    /**
     * A failure the *lookup* produced, as opposed to one the field produced.
     * Only these belong in the result slot: a syntax complaint is answered by
     * editing the input, so it stays beside the input and never moves the page.
     */
    const lookupFailure = failure !== null && !isSyntaxFailure(failure) ? failure : null;

    return (
        <div
            className={cn(
                "flex min-w-0 flex-col gap-4",
                // One accent for the whole tool, so the radar, the rails and the
                // chips all read one variable instead of five class maps.
                TOOL_ACCENT_VARS.emerald,
            )}
        >
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
                            <label htmlFor={inputId} className={FIELD_LABEL}>
                                {t("hostLabel")}
                            </label>
                            <InputLimitMeter reading={hostLimit} />
                        </div>
                        {/*
                         * Field, action and verdict share one frame. Three
                         * loose elements stacked with gaps read as a generic
                         * form; one console reads as the instrument the rest of
                         * this page is, and the focus ring moves to the frame so
                         * the whole unit lights up together.
                         */}
                        <div className="ring-border/70 bg-background/40 focus-within:ring-ring/60 flex min-w-0 flex-col rounded-xl ring-1 transition-[box-shadow] duration-200 ring-inset focus-within:ring-2">
                            <div className="flex min-w-0 items-center gap-1.5 p-1.5">
                                <IconWorldSearch
                                    className="text-muted-foreground ml-2 size-4 shrink-0"
                                    stroke={1.7}
                                    aria-hidden="true"
                                />
                                <Input
                                    id={inputId}
                                    // Capped rather than merely checked: a
                                    // hostname is typed or pasted whole, and
                                    // 2,048 characters is already far past the
                                    // 253 a name can legally be. Nothing worth
                                    // keeping is lost at the cut.
                                    maxLength={MAX_INPUT_LENGTH}
                                    value={host}
                                    onChange={(event) => setHost(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            void handleInspect();
                                        }
                                    }}
                                    disabled={running}
                                    spellCheck={false}
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    inputMode="url"
                                    aria-describedby={hintId}
                                    placeholder={t("hostPlaceholder")}
                                    className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono shadow-none focus-visible:ring-0"
                                />
                                <Button
                                    onClick={() => void handleInspect()}
                                    disabled={!canInspect}
                                    className="h-8 shrink-0 px-3"
                                >
                                    {running ? (
                                        <IconLoader2
                                            className="size-4 animate-spin"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <IconRadar2
                                            className="size-4"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {running ? t("inspecting") : t("inspect")}
                                </Button>
                            </div>

                            <StatusStrip
                                id={hintId}
                                tone={status.tone}
                                message={status.message}
                                className="border-border/60 border-t px-3.5 py-2"
                            />
                        </div>
                    </div>

                    {/*
                     * The select is wrapped so it carries the same card the
                     * switch draws for itself. A bare control beside a boxed one
                     * reads as one setting and one afterthought.
                     */}
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <div className="bg-card/60 ring-border/70 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                            <OptionSelect
                                label={t("resolverLabel")}
                                hint={t("resolverHint")}
                                value={options.resolver}
                                values={DNS_RESOLVERS}
                                items={Object.fromEntries(
                                    DNS_RESOLVERS.map((resolver) => [
                                        resolver,
                                        tResolvers(resolver),
                                    ]),
                                )}
                                disabled={running}
                                onChange={(resolver) => patch({ resolver })}
                            />
                        </div>
                        <OptionSwitch
                            label={t("probeLabel")}
                            hint={t("probeHint")}
                            checked={options.probeSite}
                            disabled={running}
                            onCheckedChange={(probeSite) => patch({ probeSite })}
                        />
                    </div>

                    {siteKey !== null && (
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
                            variant="outline"
                            onClick={() => report !== null && void handleCopy(report)}
                            disabled={report === null || running}
                            className="h-9 px-3.5"
                        >
                            <CopyIconSwap copied={copied === "summary"} />
                            {t("copy")}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => report !== null && handleDownload(report)}
                            disabled={report === null || running}
                            className="h-9 px-3.5"
                        >
                            <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                            {t("download")}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setReport(null);
                                setFailure(null);
                                setHost("");
                            }}
                            disabled={running || (report === null && host.length === 0)}
                            className="h-9 px-3.5"
                        >
                            <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                            {t("clear")}
                        </Button>
                    </div>

                    <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                        {t("serverNote")}
                    </p>
                </CardContent>
            </Card>

            <div ref={resultRef} className="min-w-0 scroll-mt-6">
                {scanning && (
                    <ScanRadar
                        label={host.trim()}
                        captions={SCAN_STAGES.map((stage) => tScan(stage))}
                        restingCaption={tScan("working")}
                    />
                )}

                {!scanning && report !== null && <DomainReportView report={report} />}

                {/*
                 * A lookup that started and then failed has to say so *here*.
                 * The page has already moved to this slot, and leaving the
                 * reason behind at the input is what makes a scroll feel
                 * broken — you arrive somewhere empty and have to go back to
                 * find out why.
                 */}
                {!scanning && report === null && lookupFailure !== null && (
                    <p
                        role="status"
                        className="bg-card ring-border/70 text-muted-foreground flex min-w-0 items-start gap-2.5 rounded-2xl px-5 py-4 text-[0.8125rem] leading-relaxed ring-1 ring-inset"
                    >
                        <IconAlertTriangle
                            className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--brand-amber)_75%,var(--muted-foreground))]"
                            stroke={1.8}
                            aria-hidden="true"
                        />
                        {tErrors(lookupFailure)}
                    </p>
                )}
            </div>
        </div>
    );
}
