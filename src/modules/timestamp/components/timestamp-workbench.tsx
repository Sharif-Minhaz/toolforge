"use client";

import { IconDownload, IconWorldPlus } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import type { StatusTone } from "@/modules/tools/components/status-strip";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { ZonePicker } from "@/modules/tools/components/zone-picker";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    getTimeZoneCity,
    getTimeZoneRegion,
    resolveLocalTimeZone,
} from "@/modules/tools/domain/time-zones";
import {
    DEFAULT_INPUT_TIME_ZONE,
    MAX_PINNED_TIME_ZONES,
    SUGGESTED_TIME_ZONES,
} from "../domain/constants";
import { convert, type TimestampConversionResult } from "../domain/convert";
import { createTimestampExportFile } from "../domain/export";
import { renderZone } from "../domain/format";
import type { EpochUnit, ZonedRendering, ZoneRole, ZoneSlot } from "../types";
import { DetailsPanel } from "./details-panel";
import { EpochPanel } from "./epoch-panel";
import { LiveClock } from "./live-clock";
import { ReadingOptions, TimestampInput } from "./timestamp-input";
import { ZoneCard } from "./zone-card";

const TICK_MS = 1000;

type TimestampWorkbenchProps = {
    initialInput: string;
    initialUnit: EpochUnit;
    initialInputTimeZone: string;
    initialPinnedTimeZones: readonly string[];
    /** The server's clock, so the first paint matches and hydration is quiet. */
    initialNowMs: number;
};

/**
 * Builds the zone list the board renders. Local first because it is the
 * question most people came with, UTC second because it is the answer most
 * systems store, then whatever was pinned — deduplicated, so a reader sitting
 * in UTC sees one card rather than two identical ones.
 */
function buildSlots(localTimeZone: string, pinned: readonly string[]): readonly ZoneSlot[] {
    const seen = new Set<string>();
    const slots: ZoneSlot[] = [];

    const add = (timeZone: string, role: ZoneRole) => {
        if (seen.has(timeZone)) {
            return;
        }

        seen.add(timeZone);
        slots.push({ timeZone, role });
    };

    add(localTimeZone, "local");
    add("UTC", "utc");

    for (const zone of pinned) {
        add(zone, "pinned");
    }

    return slots;
}

export function TimestampWorkbench({
    initialInput,
    initialUnit,
    initialInputTimeZone,
    initialPinnedTimeZones,
    initialNowMs,
}: TimestampWorkbenchProps) {
    const t = useTranslations("timestamp.workbench");
    const tErrors = useTranslations("timestamp.errors");
    const tToast = useTranslations("timestamp.toast");
    const locale = useLocale();

    const inputId = useId();
    const statusId = useId();

    const [input, setInput] = useState(initialInput);
    const [unit, setUnit] = useState<EpochUnit>(initialUnit);
    const [inputTimeZone, setInputTimeZone] = useState(initialInputTimeZone);
    const [inputRegion, setInputRegion] = useState(() => getTimeZoneRegion(initialInputTimeZone));
    const [pinned, setPinned] = useState<readonly string[]>(initialPinnedTimeZones);
    const [pickerRegion, setPickerRegion] = useState(() =>
        getTimeZoneRegion(SUGGESTED_TIME_ZONES[0]),
    );
    const [pickerZone, setPickerZone] = useState(SUGGESTED_TIME_ZONES[0]);
    const [nowMs, setNowMs] = useState(initialNowMs);
    const [clockRunning, setClockRunning] = useState(true);
    const [copiedField, setCopiedField] = useCopyFeedback<string>();

    // One clock for the whole tool: the strip at the top, the "3 days from now"
    // line at the bottom and a literal `now` in the field all read the same
    // instant, so they can never disagree with each other by a second.
    useEffect(() => {
        if (!clockRunning) {
            return;
        }

        const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);

        return () => window.clearInterval(timer);
    }, [clockRunning]);

    // The server cannot know the reader's zone, so it renders UTC and this
    // swaps in the real one immediately after hydration. Reading `Intl` during
    // the hydration pass instead would break it.
    const hydrated = useIsHydrated();
    const localTimeZone = hydrated ? resolveLocalTimeZone() : DEFAULT_INPUT_TIME_ZONE;

    // Recomputing per keystroke would re-run the parser and re-render every
    // card for each intermediate string; the typed value settles first.
    const settledInput = useDebouncedValue(input);
    const pending = settledInput !== input;

    const slots = buildSlots(localTimeZone, pinned);
    const now = new Date(nowMs);

    // Pure and deterministic given `now`, so the server-rendered pass already
    // carries the result.
    const result = convert({
        input: settledInput,
        unit,
        inputTimeZone,
        timeZones: slots.map((slot) => slot.timeZone),
        locale,
        now,
    });

    const byTimeZone = new Map<string, ZonedRendering>(
        result.ok ? result.zones.map((zone) => [zone.timeZone, zone]) : [],
    );

    function describeFailure(failure: Extract<TimestampConversionResult, { ok: false }>): string {
        switch (failure.reason) {
            case "empty":
                return tErrors("empty");
            case "too_long":
                return tErrors("tooLong");
            case "unrecognized":
                return tErrors("unrecognized");
            case "ambiguous_date":
                return tErrors("ambiguousDate");
            case "invalid_component":
                return failure.field === undefined
                    ? tErrors("invalidComponent")
                    : tErrors("invalidField", { field: tErrors(`fields.${failure.field}`) });
            case "out_of_range":
                return tErrors("outOfRange");
            case "unknown_time_zone":
                return tErrors("unknownTimeZone");
        }
    }

    function describeSuccess(success: Extract<TimestampConversionResult, { ok: true }>): string {
        // A numeric input is described by the scale it was read at, which is the
        // thing people actually need to check; anything else by its shape.
        const source =
            success.unit === undefined ? t(`detected.${success.kind}`) : t(`units.${success.unit}`);

        return success.usedInputZone
            ? t("readAsWithZone", { source, zone: getTimeZoneCity(inputTimeZone) })
            : t("readAs", { source });
    }

    const statusTone: StatusTone = !result.ok
        ? result.reason === "empty"
            ? "idle"
            : "error"
        : pending
          ? "pending"
          : "success";

    const statusMessage = result.ok ? describeSuccess(result) : describeFailure(result);

    function reportCopyFailure(failure: Extract<CopyResult, { ok: false }>) {
        const message =
            failure.reason === "empty"
                ? tToast("copyFailedEmpty")
                : failure.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function handleCopy(field: string, value: string) {
        const copied = await copyText(value);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        setCopiedField(field);
    }

    function handleAddZone() {
        if (pinned.includes(pickerZone) || pinned.length >= MAX_PINNED_TIME_ZONES) {
            return;
        }

        setPinned([...pinned, pickerZone]);
        toast.success(tToast("zoneAdded", { zone: getTimeZoneCity(pickerZone) }));
    }

    function handleRemoveZone(timeZone: string) {
        setPinned(pinned.filter((zone) => zone !== timeZone));
    }

    function handleDownload() {
        if (!result.ok) {
            return;
        }

        const exported = createTimestampExportFile({
            input: settledInput,
            epochMs: result.epochMs,
            timeZones: slots.map((slot) => slot.timeZone),
            locale,
            generatedAt: now,
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "timestamp.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const suggestions = SUGGESTED_TIME_ZONES.filter(
        (zone) => !pinned.includes(zone) && zone !== localTimeZone,
    ).slice(0, 5);
    const boardFull = pinned.length >= MAX_PINNED_TIME_ZONES;

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
                    <TimestampInput
                        value={input}
                        inputId={inputId}
                        statusId={statusId}
                        statusTone={statusTone}
                        statusMessage={statusMessage}
                        clock={
                            <LiveClock
                                nowMs={nowMs}
                                running={clockRunning}
                                copied={copiedField === "now"}
                                onToggle={() => setClockRunning(!clockRunning)}
                                onCopy={(value) => handleCopy("now", value)}
                                onUse={setInput}
                            />
                        }
                        onChange={setInput}
                        onClear={() => setInput("")}
                    />

                    {result.ok && (
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-[0.9375rem] leading-[1.3] font-medium">
                                    {t("epochTitle")}
                                </h3>
                                <Button variant="outline" size="sm" onClick={handleDownload}>
                                    <IconDownload
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("download")}
                                </Button>
                            </div>

                            <EpochPanel
                                epochs={result.epochs}
                                isoUtc={renderZone(result.epochMs, "UTC", locale).iso8601}
                                pending={pending}
                                copiedField={copiedField}
                                onCopy={handleCopy}
                            />
                        </div>
                    )}

                    <ReadingOptions
                        unit={unit}
                        inputTimeZone={inputTimeZone}
                        inputRegion={inputRegion}
                        zoneApplies={result.ok && result.usedInputZone}
                        onUnitChange={setUnit}
                        onInputRegionChange={setInputRegion}
                        onInputTimeZoneChange={setInputTimeZone}
                    />
                </CardContent>
            </Card>

            {result.ok && (
                <>
                    <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                        <CardHeader>
                            <CardTitle className="text-lg">{t("zonesTitle")}</CardTitle>
                            <CardDescription>{t("zonesDescription")}</CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-4">
                            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {slots.map((slot) => {
                                    const rendering = byTimeZone.get(slot.timeZone);

                                    if (rendering === undefined) {
                                        return null;
                                    }

                                    return (
                                        <li key={slot.timeZone} className="min-w-0">
                                            <ZoneCard
                                                rendering={rendering}
                                                role={slot.role}
                                                pending={pending}
                                                copiedField={copiedField}
                                                onCopy={handleCopy}
                                                onRemove={
                                                    slot.role === "pinned"
                                                        ? () => handleRemoveZone(slot.timeZone)
                                                        : undefined
                                                }
                                            />
                                        </li>
                                    );
                                })}
                            </ul>

                            {result.unsupportedTimeZones.length > 0 && (
                                <p
                                    role="status"
                                    className="text-muted-foreground text-xs leading-normal"
                                >
                                    {t("unsupportedZones", {
                                        zones: result.unsupportedTimeZones.join(", "),
                                    })}
                                </p>
                            )}

                            {/* A control, not a result — so it gets a heading and a
                                surface of its own. Without them it is the second
                                region-and-city pair on the page and nothing says
                                which one adds a card. */}
                            <section
                                aria-label={t("addZoneTitle")}
                                className="bg-muted/40 ring-border/60 flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4"
                            >
                                <div className="flex items-center gap-1.5">
                                    <IconWorldPlus
                                        className="text-muted-foreground size-3.5 shrink-0"
                                        stroke={1.9}
                                        aria-hidden="true"
                                    />
                                    <h3 className="text-[0.8125rem] leading-[1.3] font-medium">
                                        {t("addZoneTitle")}
                                    </h3>
                                </div>

                                <ZonePicker
                                    region={pickerRegion}
                                    timeZone={pickerZone}
                                    regionLabel={t("regionLabel")}
                                    cityLabel={t("cityLabel")}
                                    addLabel={t("addZone")}
                                    onAdd={handleAddZone}
                                    addDisabled={boardFull || pinned.includes(pickerZone)}
                                    addHint={
                                        boardFull
                                            ? t("boardFull", { max: MAX_PINNED_TIME_ZONES })
                                            : t("boardRoom", {
                                                  left: MAX_PINNED_TIME_ZONES - pinned.length,
                                              })
                                    }
                                    onRegionChange={setPickerRegion}
                                    onTimeZoneChange={setPickerZone}
                                />

                                {suggestions.length > 0 && !boardFull && (
                                    <div className="flex flex-wrap items-center gap-1">
                                        <span className="text-muted-foreground mr-0.5 text-[0.6875rem] leading-[1.4]">
                                            {t("suggestedLabel")}
                                        </span>
                                        <div
                                            role="group"
                                            aria-label={t("suggestedLabel")}
                                            className="flex flex-wrap items-center gap-1"
                                        >
                                            {suggestions.map((zone) => (
                                                <button
                                                    key={zone}
                                                    type="button"
                                                    onClick={() => setPinned([...pinned, zone])}
                                                    className="ring-border/70 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring h-7 rounded-lg px-2 text-[0.6875rem] leading-[1.4] ring-1 transition-colors duration-200 ring-inset focus-visible:ring-2 focus-visible:outline-none"
                                                >
                                                    {getTimeZoneCity(zone)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </section>
                        </CardContent>
                    </Card>

                    <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                        <CardHeader>
                            <CardTitle className="text-lg">{t("detailsTitle")}</CardTitle>
                            <CardDescription>{t("detailsDescription")}</CardDescription>
                        </CardHeader>

                        <CardContent>
                            <DetailsPanel
                                facts={result.facts}
                                relative={result.relative}
                                factsTimeZone={result.factsTimeZone}
                                pending={pending}
                            />
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
