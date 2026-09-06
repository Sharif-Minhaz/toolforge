"use client";

import { IconDownload, IconLoader2, IconWorldSearch } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { InputLimitMeter, useInputLimitStatus } from "@/modules/tools/components/input-limit-meter";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { ScanRadar } from "@/modules/tools/components/scan-radar";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { readInputLimit } from "@/modules/tools/domain/input-limit";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { DNS_RESOLVERS, type DnsResolver } from "@/modules/tools/types/network";

import { mapRoute } from "../actions/map-route";
import { DEFAULT_ROUTE_OPTIONS, MAX_INPUT_LENGTH } from "../domain/constants";
import { createRouteCsvFile, createRouteJsonFile } from "../domain/export";
import { canDrawArcs, canGroupByCountry, toGlobeArcs, toGlobeMarkers } from "../domain/markers";
import { needsResolution, parseRouteInput } from "../domain/parse";
import { ROUTE_MODES, type RouteFailureReason, type RouteMode, type RouteReport } from "../types";
import { HopTable } from "./hop-table";
import { RouteGlobe } from "./route-globe";

/** Small-caps label, matching the result panels the form sits above. */
const FIELD_LABEL =
    "text-muted-foreground text-[0.625rem] leading-normal tracking-[0.14em] uppercase";

/**
 * Complaints about the *input*, which belong beside the input. Everything else
 * is a complaint about the *operation* and belongs where the answer would have
 * been.
 */
const INPUT_FAILURES: readonly RouteFailureReason[] = [
    "empty_input",
    "input_too_long",
    "too_many_hops",
    "no_hops_found",
    "unsupported_trace_format",
    "invalid_hostname",
];

/**
 * What the sweep is captioned with while a route is in flight.
 *
 * The last hop is the destination — the thing the route was typed to reach — so
 * that is what the radar names. A box this parser cannot read is still allowed
 * to run, since the refusal comes back from the server, so the first line stands
 * in when there are no hops to name.
 */
function describeRun(text: string, mode: RouteMode): string {
    const parsed = parseRouteInput(text, mode);
    const destination = parsed.ok ? parsed.hops.at(-1)?.label : undefined;

    return destination ?? text.trim().split("\n")[0]?.trim() ?? "";
}

type IpGlobeWorkbenchProps = {
    /** From `?host=`, so a shared link opens on the host it names — filled, never run. */
    initialInput: string;
    initialMode: RouteMode;
    initialResolver: DnsResolver;
    /** False when this deployment cannot meter routes and so will not run any. */
    configured: boolean;
};

export function IpGlobeWorkbench({
    initialInput,
    initialMode,
    initialResolver,
    configured,
}: IpGlobeWorkbenchProps) {
    const t = useTranslations("ipGlobe.workbench");
    const tModes = useTranslations("ipGlobe.modes");
    const tModeHints = useTranslations("ipGlobe.modeHints");
    const tResolvers = useTranslations("ipGlobe.resolvers");
    const tOptions = useTranslations("ipGlobe.options");
    const tErrors = useTranslations("ipGlobe.errors");
    const format = useFormatter();

    const inputId = useId();
    const statusId = useId();

    const [text, setText] = useState(initialInput);
    const [mode, setMode] = useState<RouteMode>(initialMode);
    const [resolver, setResolver] = useState<DnsResolver>(initialResolver);
    const [autoRotate, setAutoRotate] = useState(DEFAULT_ROUTE_OPTIONS.autoRotate);
    const [showArcs, setShowArcs] = useState(DEFAULT_ROUTE_OPTIONS.showArcs);
    const [groupByCountry, setGroupByCountry] = useState(DEFAULT_ROUTE_OPTIONS.groupByCountry);

    const [running, setRunning] = useState(false);
    // Read off the box at the press, not off the debounced preview: a route
    // mapped 300 ms after the last keystroke would otherwise be captioned with
    // the destination of the text that came before it.
    const [runningLabel, setRunningLabel] = useState("");
    const [report, setReport] = useState<RouteReport | null>(null);
    const [failure, setFailure] = useState<RouteFailureReason | null>(null);

    const { ref: resultRef, scrollToResult } = useResultScroll();

    // Debounced: re-parsing the whole box on every keystroke is the expensive
    // derivation of decision 43, and nothing downstream of it is a control the
    // reader is typing into, so a settled value cannot revert a keystroke.
    const settled = useDebouncedValue(text, 300);

    const preview = useMemo(() => parseRouteInput(settled, mode), [settled, mode]);
    const previewHops = preview.ok ? preview.hops : [];

    const reading = readInputLimit(text.length, MAX_INPUT_LENGTH);
    const limitStatus = useInputLimitStatus(reading);

    // The single predicate behind the resolver control. A trace that printed an
    // address for every hop has nothing to resolve, so the setting would change
    // nothing — which is worth saying rather than leaving it live and inert.
    const resolverMatters = previewHops.length === 0 || needsResolution(previewHops);

    const markers = useMemo(
        () => (report === null ? [] : toGlobeMarkers(report.hops, { groupByCountry })),
        [report, groupByCountry],
    );
    const arcs = useMemo(() => (showArcs ? toGlobeArcs(markers) : []), [markers, showArcs]);

    const arcsPossible = canDrawArcs(markers);
    const groupingMatters = report === null || canGroupByCountry(report.hops);

    const canRun = configured && !running && text.trim().length > 0 && reading.state !== "over";

    function describeStatus(): { tone: StatusTone; message: string } {
        if (!configured) {
            return { tone: "error", message: t("quotaUnavailable") };
        }

        if (limitStatus !== null) {
            return limitStatus;
        }

        if (running) {
            return { tone: "pending", message: t("statusMapping") };
        }

        if (failure !== null && !INPUT_FAILURES.includes(failure)) {
            return { tone: "error", message: tErrors(failure) };
        }

        if (report !== null) {
            return {
                tone: report.summary.located === 0 ? "warning" : "success",
                message: t("statusDone", {
                    located: report.summary.located,
                    total: report.summary.total,
                    countries: report.summary.countries.length,
                }),
            };
        }

        return { tone: "idle", message: t("statusIdle") };
    }

    async function handleRun() {
        if (!canRun) {
            return;
        }

        // The previous route goes now, not when the next one lands. Leaving it
        // up while a new lookup runs shows a globe for text that is no longer in
        // the box.
        setReport(null);
        setFailure(null);
        setRunningLabel(describeRun(text, mode));
        setRunning(true);
        scrollToResult();

        try {
            const result = await mapRoute({ input: text, mode, resolver });

            if (!result.ok) {
                setFailure(result.reason);
                logEvent("warn", "ip_globe.failed", { reason: result.reason });
                toast.error(tErrors(result.reason));

                return;
            }

            setReport(result.report);
        } catch (caught) {
            setFailure("lookup_failed");
            logEvent("error", "ip_globe.action_threw", { error: describeError(caught) });
            toast.error(tErrors("lookup_failed"));
        } finally {
            setRunning(false);
        }
    }

    function handleDownload(kind: "csv" | "json") {
        if (report === null) {
            return;
        }

        saveFile(kind === "csv" ? createRouteCsvFile(report) : createRouteJsonFile(report));
    }

    const status = describeStatus();
    const inputFailure = failure !== null && INPUT_FAILURES.includes(failure) ? failure : null;

    return (
        <div className={cn("flex flex-col gap-6", TOOL_ACCENT_VARS.violet)}>
            <Card>
                <CardHeader>
                    <CardTitle>{t("title")}</CardTitle>
                    <CardDescription>{t("description")}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <OptionSelect
                            label={t("modeLabel")}
                            hint={tModeHints(mode)}
                            value={mode}
                            items={Object.fromEntries(
                                ROUTE_MODES.map((item) => [item, tModes(item)]),
                            )}
                            values={ROUTE_MODES}
                            onChange={setMode}
                        />
                        <OptionSelect
                            label={t("resolverLabel")}
                            hint={resolverMatters ? t("resolverHint") : t("resolverInert")}
                            value={resolver}
                            items={Object.fromEntries(
                                DNS_RESOLVERS.map((item) => [item, tResolvers(item)]),
                            )}
                            values={DNS_RESOLVERS}
                            disabled={!resolverMatters}
                            onChange={setResolver}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor={inputId} className={FIELD_LABEL}>
                            {t("inputLabel")}
                        </Label>
                        <Textarea
                            id={inputId}
                            value={text}
                            spellCheck={false}
                            rows={8}
                            // Never capped with `maxLength`: silently truncating a
                            // pasted trace makes a shorter route that still looks
                            // complete. The meter and the line below refuse it
                            // instead.
                            onChange={(event) => setText(event.target.value)}
                            placeholder={t(
                                mode === "traceroute" ? "placeholderTrace" : "placeholderHosts",
                            )}
                            aria-describedby={statusId}
                            className="min-h-40 font-mono text-[0.8125rem]"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t("hopsFound", { count: previewHops.length })}
                            </p>
                            <InputLimitMeter reading={reading} />
                        </div>
                        {inputFailure !== null && (
                            <p className="text-destructive text-[0.75rem] leading-[1.5]">
                                {tErrors(inputFailure)}
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                        <OptionSwitch
                            label={tOptions("autoRotateLabel")}
                            hint={tOptions("autoRotateHint")}
                            checked={autoRotate}
                            onCheckedChange={setAutoRotate}
                        />
                        <OptionSwitch
                            label={tOptions("showArcsLabel")}
                            hint={
                                arcsPossible ? tOptions("showArcsHint") : tOptions("showArcsInert")
                            }
                            checked={showArcs && arcsPossible}
                            disabled={!arcsPossible}
                            onCheckedChange={setShowArcs}
                        />
                        <OptionSwitch
                            label={tOptions("groupLabel")}
                            hint={groupingMatters ? tOptions("groupHint") : tOptions("groupInert")}
                            checked={groupByCountry}
                            disabled={!groupingMatters}
                            onCheckedChange={setGroupByCountry}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="button" onClick={handleRun} disabled={!canRun}>
                            {running ? (
                                <IconLoader2
                                    className="size-4 animate-spin"
                                    stroke={2}
                                    aria-hidden="true"
                                />
                            ) : (
                                <IconWorldSearch
                                    className="size-4"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                            )}
                            {t("run")}
                        </Button>
                    </div>

                    <StatusStrip id={statusId} tone={status.tone} message={status.message} />
                </CardContent>
            </Card>

            <div ref={resultRef} className="scroll-mt-6">
                {/*
                 * The radar occupies the slot the result will take, so the swap
                 * reads as one instrument settling rather than two components
                 * trading places — the same sweep the other three network tools
                 * run.
                 *
                 * One caption, not a cycle. Every hop is looked up in parallel
                 * rather than in named phases, so the stages a cycle would name
                 * are all in flight at once; putting them on a 1.4-second timer
                 * would be a sequence invented for the animation.
                 */}
                {running && (
                    <ScanRadar
                        label={runningLabel}
                        captions={[t("statusMapping")]}
                        restingCaption={t("statusMapping")}
                    />
                )}

                {!running && report !== null && (
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("resultTitle")}</CardTitle>
                            <CardDescription>
                                {t("resultDescription", {
                                    countries: report.summary.countries.length,
                                    networks: report.summary.asns.length,
                                })}
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-5">
                            {markers.length > 0 && (
                                <div className="mx-auto w-full max-w-md">
                                    <RouteGlobe
                                        markers={markers}
                                        arcs={arcs}
                                        autoRotate={autoRotate}
                                        label={t("globeLabel", {
                                            located: report.summary.located,
                                            countries: report.summary.countries.length,
                                        })}
                                        unsupportedLabel={t("globeUnsupported")}
                                    />
                                    <p className="text-muted-foreground mt-2 text-center text-[0.6875rem] leading-[1.5]">
                                        {t("centroidNote")}
                                    </p>
                                </div>
                            )}

                            <HopTable hops={report.hops} />

                            <dl className="grid gap-3 sm:grid-cols-3">
                                <div className="bg-card/60 ring-border/70 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                                    <dt className={FIELD_LABEL}>{t("summaryHops")}</dt>
                                    <dd className="text-lg font-semibold tabular-nums">
                                        {format.number(report.summary.total)}
                                    </dd>
                                </div>
                                <div className="bg-card/60 ring-border/70 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                                    <dt className={FIELD_LABEL}>{t("summaryCountries")}</dt>
                                    <dd className="text-lg font-semibold tabular-nums">
                                        {format.number(report.summary.countries.length)}
                                    </dd>
                                </div>
                                <div className="bg-card/60 ring-border/70 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                                    <dt className={FIELD_LABEL}>{t("summaryNetworks")}</dt>
                                    <dd className="text-lg font-semibold tabular-nums">
                                        {format.number(report.summary.asns.length)}
                                    </dd>
                                </div>
                            </dl>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload("csv")}
                                >
                                    <IconDownload
                                        className="size-4"
                                        stroke={1.9}
                                        aria-hidden="true"
                                    />
                                    {t("downloadCsv")}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload("json")}
                                >
                                    <IconDownload
                                        className="size-4"
                                        stroke={1.9}
                                        aria-hidden="true"
                                    />
                                    {t("downloadJson")}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
