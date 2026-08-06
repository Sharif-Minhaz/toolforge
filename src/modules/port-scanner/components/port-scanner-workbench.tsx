"use client";

import {
    IconAlertTriangle,
    IconCurrentLocation,
    IconDownload,
    IconLoader2,
    IconRadar2,
    IconShieldLock,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { ScanRadar } from "@/modules/tools/components/scan-radar";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { checkHostSyntax, type HostSyntaxFailure } from "@/modules/tools/domain/host-syntax";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { scanPorts } from "../actions/scan-ports";
import {
    MAX_INPUT_LENGTH,
    MAX_PORT_SPEC_LENGTH,
    MAX_PORTS_PER_SCAN,
    TURNSTILE_ACTION,
} from "../domain/constants";
import { buildScanCsv, createScanCsvFile, createScanJsonFile } from "../domain/export";
import { resolveRequestedPorts } from "../domain/port-spec";
import { isFullyFiltered } from "../domain/summary";
import type { QuotaState } from "@/modules/tools/types";
import { PORT_PRESETS, type PortPreset, type ScanFailure, type ScanReport } from "../types";
import { ResultsTable } from "./results-table";

/** Small-caps label, matching the result panels the form sits above. */
const FIELD_LABEL =
    "text-muted-foreground text-[0.625rem] leading-normal tracking-[0.14em] uppercase";

const SYNTAX_FAILURES: readonly HostSyntaxFailure[] = [
    "empty_input",
    "too_long",
    "invalid_hostname",
];

type PortScannerWorkbenchProps = {
    /** From `?host=`, so a shared link opens on the host it names. */
    initialHost: string;
    initialPreset: PortPreset;
    /**
     * The visitor's own address, read from the request on the server. Prefilled
     * because the first useful question is almost always what the internet can
     * already see of you — and because a self-scan is the one use of this tool
     * that needs nobody's permission.
     */
    viewerAddress: string | null;
    /** Absent when this deployment cannot meter scans and so will not run any. */
    siteKey: string | null;
    configured: boolean;
    initialQuota: QuotaState | null;
};

export function PortScannerWorkbench({
    initialHost,
    initialPreset,
    viewerAddress,
    siteKey,
    configured,
    initialQuota,
}: PortScannerWorkbenchProps) {
    const t = useTranslations("portScanner.workbench");
    const tPresets = useTranslations("portScanner.presets");
    const tPresetHints = useTranslations("portScanner.presetHints");
    const tErrors = useTranslations("portScanner.errors");
    const tToast = useTranslations("portScanner.toast");
    const format = useFormatter();

    const hostId = useId();
    const portsId = useId();
    const statusId = useId();

    const [host, setHost] = useState(initialHost);
    const [preset, setPreset] = useState<PortPreset>(initialPreset);
    const [spec, setSpec] = useState("");

    // Both cap at `maxLength`, so neither can read "over". The port meter is
    // hidden while a preset owns the field, or a disabled box would count
    // down a value the reader cannot change.
    const specLimit = useInputLimit(spec.length, MAX_PORT_SPEC_LENGTH);
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState<ScanReport | null>(null);
    const [failure, setFailure] = useState<ScanFailure | null>(null);
    const [quota, setQuota] = useState(initialQuota);
    const [token, setToken] = useState<string | null>(null);
    const [resetSignal, setResetSignal] = useState(0);

    const { ref: resultRef, scrollToResult } = useResultScroll();

    // Derived during render rather than held in state: the count and the button
    // must agree with the field on the same keystroke, and a second state kept
    // in step by an effect is the version that drifts.
    const requested = resolveRequestedPorts(preset, spec);
    const portCount = requested.ok ? requested.ports.length : 0;

    const exhausted = quota !== null && quota.remaining <= 0;
    const canScan = configured && !running && token !== null && portCount > 0 && !exhausted;

    function renewChallenge() {
        setToken(null);
        setResetSignal((current) => current + 1);
    }

    function describeFailure(current: ScanFailure): string {
        switch (current.reason) {
            case "invalid_ports":
                return tErrors("invalid_ports", { token: current.token ?? "" });
            case "too_many_ports":
                return tErrors("too_many_ports", {
                    count: current.count ?? 0,
                    max: MAX_PORTS_PER_SCAN,
                });
            default:
                return tErrors(current.reason);
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (!configured) {
            return { tone: "error", message: t("quotaUnavailable") };
        }

        if (running) {
            return { tone: "pending", message: t("statusScanning", { count: portCount }) };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure) };
        }

        if (exhausted) {
            return { tone: "warning", message: tErrors("quota_exceeded") };
        }

        if (report !== null) {
            return {
                tone: "success",
                message: t("statusDone", {
                    open: report.summary.open,
                    total: report.summary.total,
                }),
            };
        }

        return { tone: "idle", message: t("statusIdle") };
    }

    async function handleScan() {
        if (!canScan || token === null) {
            return;
        }

        // Checked here as well as on the server, because everything past this
        // line costs the reader something a typo should not: a Turnstile token,
        // one of a small hourly allowance, and a scroll to a result area that
        // is never going to fill.
        const syntax = checkHostSyntax(host, MAX_INPUT_LENGTH);

        if (syntax !== null) {
            setReport(null);
            setFailure({ ok: false, reason: syntax });

            return;
        }

        if (!requested.ok) {
            setReport(null);
            setFailure({
                ok: false,
                reason: requested.reason,
                token: requested.token,
                count: requested.count,
            });

            return;
        }

        // The previous result goes *now*, not when the next one lands. Leaving
        // it up while a new scan runs shows a table of ports for a host that
        // may no longer be the one in the field — and the moment it swaps, a
        // reader has no way to tell which scan they are looking at.
        setReport(null);
        setFailure(null);
        setRunning(true);
        scrollToResult();

        try {
            const result = await scanPorts({
                host: host.trim(),
                preset,
                ports: spec,
                turnstileToken: token,
            });

            if (result.quota !== undefined) {
                setQuota(result.quota);
            }

            if (!result.ok) {
                setReport(null);
                setFailure(result);
                logEvent("warn", "port_scanner.failed", { reason: result.reason });
                toast.error(describeFailure(result));

                return;
            }

            setReport(result);
            setQuota(result.quota);
        } catch (caught) {
            setReport(null);
            setFailure({ ok: false, reason: "scan_failed" });
            logEvent("error", "port_scanner.action_threw", { error: describeError(caught) });
            toast.error(tErrors("scan_failed"));
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

    async function handleCopy(current: ScanReport) {
        const result = await copyText(buildScanCsv(current));

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        toast.success(tToast("copied"));
    }

    function handleDownload(current: ScanReport, kind: "csv" | "json") {
        const file = kind === "csv" ? createScanCsvFile(current) : createScanJsonFile(current);

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "port_scanner.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const status = describeStatus();
    const showSyntaxComplaintHere =
        failure !== null && SYNTAX_FAILURES.some((reason) => reason === failure.reason);

    return (
        <div className={cn("flex flex-col gap-6", TOOL_ACCENT_VARS.rose)}>
            <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                <span
                    aria-hidden="true"
                    className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
                />

                <CardHeader>
                    <CardTitle className="text-lg">{t("title")}</CardTitle>
                    <CardDescription>{t("description")}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-5">
                    {/*
                     * Above the form, not below it. This tool cannot keep the
                     * promise the rest of the site makes — a scan has to leave
                     * a server — and a reader deserves to know whose address
                     * lands in the target's log before they press anything.
                     */}
                    <div className="ring-brand-amber/30 bg-brand-amber/8 flex items-start gap-2.5 rounded-xl px-3.5 py-3 ring-1 ring-inset">
                        <IconShieldLock
                            className="text-brand-amber mt-0.5 size-4 shrink-0"
                            stroke={1.8}
                            aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-col gap-1">
                            <p className="text-[0.8125rem] leading-[1.4] font-medium">
                                {t("disclosureTitle")}
                            </p>
                            <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                                {t("disclosure")}
                            </p>
                            <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                                {t("authorization")}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={hostId} className={FIELD_LABEL}>
                                <span className="leading-[1.3]">{t("hostLabel")}</span>
                            </Label>
                            {viewerAddress !== null && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setHost(viewerAddress)}
                                >
                                    <IconCurrentLocation
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("useYourIp")}
                                </Button>
                            )}
                        </div>

                        <Input
                            id={hostId}
                            // Capped: 2,048 characters is already eight times
                            // the longest legal hostname, so the cut can only
                            // ever land in a paste that was never a host.
                            maxLength={MAX_INPUT_LENGTH}
                            value={host}
                            spellCheck={false}
                            autoCapitalize="off"
                            autoComplete="off"
                            autoCorrect="off"
                            placeholder={t("hostPlaceholder")}
                            aria-describedby={statusId}
                            onChange={(event) => setHost(event.target.value)}
                            className="font-mono text-[0.8125rem]"
                        />

                        {viewerAddress !== null && (
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t("yourIp", { address: viewerAddress })}
                            </p>
                        )}

                        {/* A complaint about the input belongs beside the input,
                            and must not move the page. */}
                        {showSyntaxComplaintHere && failure !== null && (
                            <p
                                role="alert"
                                className="text-destructive flex items-start gap-2 text-[0.8125rem] leading-relaxed"
                            >
                                <IconAlertTriangle
                                    className="mt-0.5 size-4 shrink-0"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {describeFailure(failure)}
                            </p>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <OptionSelect
                            label={t("presetLabel")}
                            hint={tPresetHints(preset)}
                            value={preset}
                            values={PORT_PRESETS}
                            items={Object.fromEntries(
                                PORT_PRESETS.map((value) => [value, tPresets(value)]),
                            )}
                            onChange={setPreset}
                        />

                        <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label htmlFor={portsId} className="text-muted-foreground text-xs">
                                    <span className="leading-[1.3]">{t("portsLabel")}</span>
                                </Label>
                                {preset === "custom" && <InputLimitMeter reading={specLimit} />}
                            </div>
                            <Textarea
                                id={portsId}
                                maxLength={MAX_PORT_SPEC_LENGTH}
                                value={spec}
                                disabled={preset !== "custom"}
                                spellCheck={false}
                                placeholder={t("portsPlaceholder")}
                                onChange={(event) => setSpec(event.target.value)}
                                className="min-h-16 resize-y rounded-xl font-mono text-[0.8125rem]"
                            />
                            {/* Not the preset's hint again — that is already
                                under the select two inches away, and printing
                                it twice reads as a rendering bug. A disabled
                                field's caption is for saying why it is
                                disabled. */}
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {preset === "custom"
                                    ? t("portsHint", { max: MAX_PORTS_PER_SCAN })
                                    : t("portsDisabled", { preset: tPresets("custom") })}
                            </p>
                        </div>
                    </div>

                    {siteKey !== null && (
                        // The widget draws at `size: "flexible"`, so it fills
                        // whatever box it is given — unconstrained, it spans the
                        // whole card with its content stranded at one end. The
                        // cap is the widget's own comfortable width; `min-h`
                        // holds the space while the script loads so the button
                        // below does not jump.
                        <div className="min-h-16 w-full max-w-82 min-w-0">
                            <TurnstileWidget
                                siteKey={siteKey}
                                action={TURNSTILE_ACTION}
                                resetSignal={resetSignal}
                                onVerify={setToken}
                                onExpire={() => setToken(null)}
                                onError={() => setToken(null)}
                            />
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={handleScan} disabled={!canScan}>
                            {running ? (
                                <IconLoader2
                                    className="size-4 animate-spin"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            ) : (
                                <IconRadar2 className="size-4" stroke={1.8} aria-hidden="true" />
                            )}
                            {running ? t("scanning") : t("scan")}
                        </Button>

                        {portCount > 0 && (
                            <span className="text-muted-foreground text-[0.8125rem]">
                                {t("portsCount", { count: portCount })}
                            </span>
                        )}

                        {quota !== null && (
                            <span
                                className={cn(
                                    "ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ring-1 ring-inset",
                                    exhausted
                                        ? "text-brand-amber ring-brand-amber/30 bg-brand-amber/8"
                                        : "text-muted-foreground ring-border/70 bg-card/70",
                                )}
                            >
                                <span className="leading-[1.3]">
                                    {t("quotaRemaining", { remaining: quota.remaining })}
                                </span>
                            </span>
                        )}
                    </div>

                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        className="[&>span]:min-w-0 [&>span]:wrap-break-word"
                    />
                </CardContent>
            </Card>

            <div ref={resultRef} className="scroll-mt-6">
                {/*
                 * The radar occupies the slot the result will take, so the swap
                 * reads as one instrument settling rather than two components
                 * trading places. It mounts in the same commit the scroll fires
                 * in, which is why scrolling early is right here: the reader
                 * arrives at the sweep rather than at a gap.
                 *
                 * One caption, not a cycle. A port scan is a single round trip
                 * whose progress cannot be observed from here, and inventing
                 * stages to animate would be a lie told at 1.4-second
                 * intervals.
                 */}
                {running && (
                    <ScanRadar
                        label={host.trim()}
                        captions={[t("statusScanning", { count: portCount })]}
                        restingCaption={t("statusScanning", { count: portCount })}
                    />
                )}

                {!running && report !== null && (
                    <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                        <CardHeader>
                            <CardTitle className="text-base">{t("resultsTitle")}</CardTitle>
                            <CardDescription className="font-mono text-[0.75rem]">
                                {report.hostname}
                                {report.address !== report.hostname && ` · ${report.address}`}
                                {` · ${format.dateTime(new Date(report.startedAt), { timeStyle: "medium" })}`}
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {(
                                    [
                                        ["summaryOpen", report.summary.open],
                                        ["summaryClosed", report.summary.closed],
                                        ["summaryFiltered", report.summary.filtered],
                                        ["summaryTotal", report.summary.total],
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

                            {isFullyFiltered(report.summary) && (
                                <p className="text-muted-foreground flex items-start gap-2 text-[0.8125rem] leading-relaxed">
                                    <IconAlertTriangle
                                        className="text-brand-amber mt-0.5 size-4 shrink-0"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("allFiltered")}
                                </p>
                            )}

                            <ResultsTable results={report.results} />

                            <p className="text-muted-foreground/80 text-[0.6875rem] leading-[1.4]">
                                {t("serviceCaveat")}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopy(report)}
                                >
                                    {t("copy")}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(report, "csv")}
                                >
                                    <IconDownload
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("downloadCsv")}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(report, "json")}
                                >
                                    <IconDownload
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("downloadJson")}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* A complaint about the *lookup* belongs where the answer would
                    have been, or the reader arrives somewhere empty and has to
                    scroll back to learn why. */}
                {!running && report === null && failure !== null && !showSyntaxComplaintHere && (
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
                                {describeFailure(failure)}
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
