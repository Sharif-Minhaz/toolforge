"use client";

import { IconDownload, IconLoader2, IconRadar2, IconTrash } from "@tabler/icons-react";
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
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { inspectDomain } from "../actions/inspect-domain";
import { TURNSTILE_ACTION } from "../domain/constants";
import { createDomainReportFile, summarizeReport } from "../domain/export";
import {
    DNS_RESOLVERS,
    type DomainReport,
    type InspectionFailureReason,
    type InspectionOptions,
} from "../types";
import {
    CertificatePanel,
    DnsPanel,
    HostingPanel,
    HttpPanel,
    OverviewPanel,
    RegistrationPanel,
    TechnologiesPanel,
} from "./report-panels";

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
    const format = useFormatter();

    const inputId = useId();
    const hintId = useId();

    // The lookup is an explicit press, not a derivation, so there is nothing to
    // debounce: no keystroke costs a request, and the 300 ms rule for typed
    // input does not apply to a field whose value is only read on submit.
    const [host, setHost] = useState(initialHost);
    const [options, setOptions] = useState<InspectionOptions>(initialOptions);
    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState<DomainReport | null>(null);
    const [failure, setFailure] = useState<InspectionFailureReason | null>(null);
    const [copied, setCopied] = useCopyFeedback<"summary">();

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

        setRunning(true);
        setFailure(null);

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

    return (
        <div className="flex min-w-0 flex-col gap-5">
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
                        <label
                            htmlFor={inputId}
                            className="text-muted-foreground text-xs leading-[1.3]"
                        >
                            {t("hostLabel")}
                        </label>
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                            <Input
                                id={inputId}
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
                                className="min-w-0 flex-1 font-mono"
                            />
                            <Button
                                onClick={() => void handleInspect()}
                                disabled={!canInspect}
                                className="h-9 shrink-0 px-3.5"
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
                        <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                    </div>

                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <OptionSelect
                            label={t("resolverLabel")}
                            hint={t("resolverHint")}
                            value={options.resolver}
                            values={DNS_RESOLVERS}
                            items={Object.fromEntries(
                                DNS_RESOLVERS.map((resolver) => [resolver, tResolvers(resolver)]),
                            )}
                            disabled={running}
                            onChange={(resolver) => patch({ resolver })}
                        />
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

            {report !== null && (
                <div
                    className={cn(
                        "grid min-w-0 gap-4 transition-opacity duration-200 xl:grid-cols-2",
                        running && "opacity-55",
                    )}
                >
                    <OverviewPanel breakdown={report.breakdown} />
                    <RegistrationPanel registration={report.registration} />
                    <DnsPanel dns={report.dns} />
                    <HostingPanel hosting={report.hosting} />
                    <CertificatePanel certificate={report.certificate} />
                    <HttpPanel http={report.http} />
                    <TechnologiesPanel technologies={report.technologies} />
                </div>
            )}
        </div>
    );
}
