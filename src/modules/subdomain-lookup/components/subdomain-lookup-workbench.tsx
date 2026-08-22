"use client";

import {
    IconAlertTriangle,
    IconChevronLeft,
    IconChevronRight,
    IconDownload,
    IconLoader2,
    IconSearch,
    IconSitemap,
    IconX,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { ScanRadar } from "@/modules/tools/components/scan-radar";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { checkHostSyntax } from "@/modules/tools/domain/host-syntax";

import { lookupSubdomains } from "../actions/lookup-subdomains";
import { MAX_INPUT_LENGTH, PAGE_SIZE } from "../domain/constants";
import {
    buildSubdomainText,
    createSubdomainCsvFile,
    createSubdomainJsonFile,
    createSubdomainTextFile,
} from "../domain/export";
import { filterRecords, pageCount, pageOf, sortRecords } from "../domain/list";
import {
    SUBDOMAIN_SORTS,
    type LookupAllowance,
    type LookupFailure,
    type SubdomainReport,
    type SubdomainSort,
} from "../types";
import { SubdomainTable } from "./subdomain-table";

/** Small-caps label, matching the result panels the form sits above. */
const FIELD_LABEL =
    "text-muted-foreground text-[0.625rem] leading-normal tracking-[0.14em] uppercase";

/**
 * Complaints about the *input*, which belong beside the input. Everything else
 * is a complaint about the *operation* and belongs where the answer would have
 * been.
 */
const INPUT_FAILURES: readonly LookupFailure["reason"][] = [
    "empty_input",
    "too_long",
    "invalid_hostname",
    "unknown_suffix",
    "ip_address",
];

type SubdomainLookupWorkbenchProps = {
    /** From `?apex=`, so a shared link opens on the domain it names — filled, never run. */
    initialApex: string;
    initialSort: SubdomainSort;
    /** False when this deployment cannot meter lookups and so will not run any. */
    configured: boolean;
};

export function SubdomainLookupWorkbench({
    initialApex,
    initialSort,
    configured,
}: SubdomainLookupWorkbenchProps) {
    const t = useTranslations("subdomainLookup.workbench");
    const tSorts = useTranslations("subdomainLookup.sorts");
    const tSortHints = useTranslations("subdomainLookup.sortHints");
    const tErrors = useTranslations("subdomainLookup.errors");
    const tToast = useTranslations("subdomainLookup.toast");
    const format = useFormatter();

    const apexId = useId();
    const filterId = useId();
    const statusId = useId();

    const [apex, setApex] = useState(initialApex);
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState<SubdomainReport | null>(null);
    const [failure, setFailure] = useState<LookupFailure | null>(null);
    const [allowance, setAllowance] = useState<LookupAllowance | null>(null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SubdomainSort>(initialSort);
    const [page, setPage] = useState(1);

    const { ref: resultRef, scrollToResult } = useResultScroll();

    // Ordering is the expensive half — it touches every one of up to twenty
    // thousand records — so it is memoised on the two things that change it and
    // never re-runs for a keystroke in the filter box.
    const ordered = useMemo(
        () => (report === null ? [] : sortRecords(report.records, sort)),
        [report, sort],
    );

    // Deliberately **not** debounced. Decision 43: a filter over data already in
    // memory must never lag, because a list that trails the box by 300 ms reads
    // as broken rather than as considered. Filtering is a substring test over an
    // already-ordered array, which is cheap enough to run on every keystroke.
    const matching = filterRecords(ordered, query);
    const pages = pageCount(matching.length);
    const visible = pageOf(matching, page, PAGE_SIZE);

    const exhausted = allowance !== null && allowance.remaining <= 0;
    const canLookup = configured && !running && apex.trim().length > 0 && !exhausted;

    function describeFailure(current: LookupFailure): string {
        return tErrors(current.reason);
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (!configured) {
            return { tone: "error", message: t("quotaUnavailable") };
        }

        if (running) {
            return { tone: "pending", message: t("statusLooking", { apex: apex.trim() }) };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure) };
        }

        if (report !== null) {
            return {
                tone: report.summary.total === 0 ? "warning" : "success",
                message: t("statusDone", { total: report.summary.total, apex: report.apex }),
            };
        }

        return { tone: "idle", message: t("statusIdle") };
    }

    /** A new list invalidates the page number, so both resets live here. */
    function changeFilter(next: string) {
        setQuery(next);
        setPage(1);
    }

    function changeSort(next: SubdomainSort) {
        setSort(next);
        setPage(1);
    }

    async function handleLookup() {
        if (!canLookup) {
            return;
        }

        // Checked here as well as on the server, because everything past this
        // line costs the reader one of a small hourly allowance — and costs this
        // site one of a smaller shared one — and moves the page to a result area
        // that is never going to fill.
        const syntax = checkHostSyntax(apex, MAX_INPUT_LENGTH);

        if (syntax !== null) {
            setReport(null);
            setFailure({ ok: false, reason: syntax });

            return;
        }

        // The previous result goes now, not when the next one lands. Leaving it
        // up while a new lookup runs shows a list of names for a domain that may
        // no longer be the one in the field.
        setReport(null);
        setFailure(null);
        setQuery("");
        setPage(1);
        setRunning(true);
        scrollToResult();

        try {
            const result = await lookupSubdomains({ apex: apex.trim() });

            if (!result.ok) {
                setAllowance(result.allowance ?? null);
                setFailure(result);
                logEvent("warn", "subdomain_lookup.failed", { reason: result.reason });
                toast.error(describeFailure(result));

                return;
            }

            setReport(result);
            setAllowance(result.allowance);
        } catch (caught) {
            setFailure({ ok: false, reason: "upstream_unavailable" });
            logEvent("error", "subdomain_lookup.action_threw", { error: describeError(caught) });
            toast.error(tErrors("upstream_unavailable"));
        } finally {
            setRunning(false);
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

    async function handleCopy() {
        const result = await copyText(buildSubdomainText(matching));

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        toast.success(tToast("copied", { count: matching.length }));
    }

    function handleDownload(current: SubdomainReport, kind: "txt" | "csv" | "json") {
        const file =
            kind === "txt"
                ? createSubdomainTextFile(current, matching)
                : kind === "csv"
                  ? createSubdomainCsvFile(current, matching)
                  : createSubdomainJsonFile(current, matching);

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "subdomain_lookup.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const status = describeStatus();
    const showComplaintHere =
        failure !== null && INPUT_FAILURES.some((reason) => reason === failure.reason);

    return (
        <div className={cn("flex flex-col gap-6", TOOL_ACCENT_VARS.cyan)}>
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
                    <div className="flex flex-col gap-2">
                        <Label htmlFor={apexId} className={FIELD_LABEL}>
                            <span className="leading-[1.3]">{t("apexLabel")}</span>
                        </Label>

                        <Input
                            id={apexId}
                            // Capped: eight times the longest legal hostname, so
                            // the cut can only land in a paste that was never a
                            // domain.
                            maxLength={MAX_INPUT_LENGTH}
                            value={apex}
                            spellCheck={false}
                            autoCapitalize="off"
                            autoComplete="off"
                            autoCorrect="off"
                            placeholder={t("apexPlaceholder")}
                            aria-describedby={statusId}
                            onChange={(event) => setApex(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    void handleLookup();
                                }
                            }}
                            className="font-mono text-[0.8125rem]"
                        />

                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("apexHint")}
                        </p>

                        {/* A complaint about the input belongs beside the input,
                            and must not move the page. */}
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
                                {describeFailure(failure)}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={handleLookup} disabled={!canLookup}>
                            {running ? (
                                <IconLoader2
                                    className="size-4 animate-spin"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            ) : (
                                <IconSitemap className="size-4" stroke={1.8} aria-hidden="true" />
                            )}
                            {running ? t("looking") : t("lookup")}
                        </Button>

                        {allowance !== null && (
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
                 * trading places. One caption, not a cycle: this is a single
                 * round trip whose progress cannot be observed from here, and
                 * inventing stages to animate would be a lie told on a timer.
                 */}
                {running && (
                    <ScanRadar
                        label={apex.trim()}
                        captions={[t("statusLooking", { apex: apex.trim() })]}
                        restingCaption={t("statusLooking", { apex: apex.trim() })}
                    />
                )}

                {!running && report !== null && (
                    <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                        <CardHeader>
                            <CardTitle className="text-base">{t("resultsTitle")}</CardTitle>
                            <CardDescription className="font-mono text-[0.75rem]">
                                {report.apex}
                                {` · ${t("fetchedAt", {
                                    time: format.dateTime(new Date(report.fetchedAt), {
                                        timeStyle: "medium",
                                    }),
                                })}`}
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-4">
                            {report.narrowedFrom !== null && (
                                <p className="text-muted-foreground bg-card/60 ring-border/70 rounded-xl px-3.5 py-2.5 text-[0.8125rem] leading-relaxed ring-1 ring-inset">
                                    {t("narrowed", {
                                        typed: report.narrowedFrom,
                                        apex: report.apex,
                                    })}
                                </p>
                            )}

                            {report.summary.total === 0 ? (
                                <div className="flex flex-col gap-1.5 py-6 text-center">
                                    <p className="text-[0.9375rem] font-medium">
                                        {t("emptyTitle")}
                                    </p>
                                    <p className="text-muted-foreground mx-auto max-w-[52ch] text-[0.8125rem] leading-relaxed">
                                        {t("emptyBody", { apex: report.apex })}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        {(
                                            [
                                                ["summaryTotal", report.summary.total],
                                                ["summaryRecent", report.summary.recent],
                                                ["summaryDepth", report.summary.maxDepth],
                                                ["summaryDated", report.summary.dated],
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

                                    {report.summary.truncated && (
                                        <p className="text-brand-amber flex items-start gap-2 text-[0.8125rem] leading-relaxed">
                                            <IconAlertTriangle
                                                className="mt-0.5 size-4 shrink-0"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("truncated", {
                                                returned: report.summary.returned,
                                                kept: report.summary.total,
                                            })}
                                        </p>
                                    )}

                                    <p className="text-muted-foreground/80 text-[0.6875rem] leading-[1.4]">
                                        {report.summary.newestAt === null ||
                                        report.summary.oldestAt === null
                                            ? t("noDates")
                                            : t("dateRange", {
                                                  oldest: format.dateTime(
                                                      new Date(report.summary.oldestAt),
                                                      { dateStyle: "medium", timeZone: "UTC" },
                                                  ),
                                                  newest: format.dateTime(
                                                      new Date(report.summary.newestAt),
                                                      { dateStyle: "medium", timeZone: "UTC" },
                                                  ),
                                              })}
                                        {!report.summary.apexIncluded && ` ${t("apexMissing")}`}
                                    </p>

                                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                                        <div className="flex min-w-0 flex-col gap-1.5">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <Label
                                                    htmlFor={filterId}
                                                    className="text-muted-foreground text-xs"
                                                >
                                                    <span className="leading-[1.3]">
                                                        {t("filterLabel")}
                                                    </span>
                                                </Label>
                                                <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
                                                    {t("matchCount", {
                                                        shown: matching.length,
                                                        total: report.summary.total,
                                                    })}
                                                </span>
                                            </div>
                                            <div className="relative">
                                                <IconSearch
                                                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                                <Input
                                                    id={filterId}
                                                    value={query}
                                                    spellCheck={false}
                                                    autoCapitalize="off"
                                                    autoComplete="off"
                                                    autoCorrect="off"
                                                    placeholder={t("filterPlaceholder")}
                                                    onChange={(event) =>
                                                        changeFilter(event.target.value)
                                                    }
                                                    className="px-9 font-mono text-[0.8125rem]"
                                                />
                                                {query.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => changeFilter("")}
                                                        aria-label={t("clearFilter")}
                                                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                                                    >
                                                        <IconX
                                                            className="size-3.5"
                                                            stroke={1.9}
                                                            aria-hidden="true"
                                                        />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <OptionSelect
                                            label={t("sortLabel")}
                                            hint={tSortHints(sort)}
                                            value={sort}
                                            values={SUBDOMAIN_SORTS}
                                            items={Object.fromEntries(
                                                SUBDOMAIN_SORTS.map((value) => [
                                                    value,
                                                    tSorts(value),
                                                ]),
                                            )}
                                            onChange={changeSort}
                                        />
                                    </div>

                                    {matching.length === 0 ? (
                                        <p className="text-muted-foreground py-6 text-center text-[0.8125rem] leading-relaxed">
                                            {t("noMatches", { total: report.summary.total })}
                                        </p>
                                    ) : (
                                        <>
                                            <SubdomainTable records={visible} apex={report.apex} />

                                            {pages > 1 && (
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span
                                                        aria-live="polite"
                                                        className="text-muted-foreground text-[0.75rem] tabular-nums"
                                                    >
                                                        {t("pageStatus", { page, pages })}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={page <= 1}
                                                            onClick={() =>
                                                                setPage((current) =>
                                                                    Math.max(1, current - 1),
                                                                )
                                                            }
                                                        >
                                                            <IconChevronLeft
                                                                className="size-3.5"
                                                                stroke={1.9}
                                                                aria-hidden="true"
                                                            />
                                                            {t("previousPage")}
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={page >= pages}
                                                            onClick={() =>
                                                                setPage((current) =>
                                                                    Math.min(pages, current + 1),
                                                                )
                                                            }
                                                        >
                                                            {t("nextPage")}
                                                            <IconChevronRight
                                                                className="size-3.5"
                                                                stroke={1.9}
                                                                aria-hidden="true"
                                                            />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <p className="text-muted-foreground/80 text-[0.6875rem] leading-[1.4]">
                                        {t("exportNote")}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={matching.length === 0}
                                            onClick={handleCopy}
                                        >
                                            {t("copy")}
                                        </Button>
                                        {(["txt", "csv", "json"] as const).map((kind) => (
                                            <Button
                                                key={kind}
                                                variant="outline"
                                                size="sm"
                                                disabled={matching.length === 0}
                                                onClick={() => handleDownload(report, kind)}
                                            >
                                                <IconDownload
                                                    className="size-3.5"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                                {kind === "txt"
                                                    ? t("downloadTxt")
                                                    : kind === "csv"
                                                      ? t("downloadCsv")
                                                      : t("downloadJson")}
                                            </Button>
                                        ))}
                                    </div>
                                </>
                            )}

                            <p className="text-muted-foreground/80 text-[0.6875rem] leading-[1.4]">
                                {t("freshness")}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* A complaint about the *lookup* belongs where the answer would
                    have been, or the reader arrives somewhere empty and has to
                    scroll back to learn why. The input complaints are already
                    beside the box, so they are excluded here. */}
                {!running && report === null && failure !== null && !showComplaintHere && (
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
