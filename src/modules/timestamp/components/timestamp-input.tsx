"use client";

import { IconAdjustmentsHorizontal, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { ZonePicker } from "@/modules/tools/components/zone-picker";
import { EXAMPLE_INPUTS, MAX_INPUT_LENGTH } from "../domain/constants";
import { EPOCH_UNITS, type EpochUnit } from "../types";

type TimestampInputProps = {
    value: string;
    inputId: string;
    statusId: string;
    statusTone: StatusTone;
    statusMessage: string;
    /** The live-clock pill, rendered beside the label. */
    clock: ReactNode;
    onChange: (value: string) => void;
    onClear: () => void;
};

/**
 * The field, its examples, and — kept deliberately below both — the two knobs
 * that change how the field is read.
 *
 * The knobs used to sit between the input and the answer, three identical
 * selects in a row, which made a page with one job look like a form with four.
 * They now live in a muted panel under the result: they are needed rarely,
 * `auto` detection covers almost every input, and demoting them lets the eye
 * run straight from what was typed to what it means.
 */
export function TimestampInput({
    value,
    inputId,
    statusId,
    statusTone,
    statusMessage,
    clock,
    onChange,
    onClear,
}: TimestampInputProps) {
    const t = useTranslations("timestamp.workbench");

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t("inputLabel")}</span>
                </Label>
                {clock}
            </div>

            <div
                className={cn(
                    "bg-card flex items-center gap-1 rounded-xl px-2 ring-1 transition-colors duration-200 ring-inset",
                    statusTone === "error"
                        ? "ring-destructive"
                        : "ring-input focus-within:ring-ring focus-within:ring-2",
                )}
            >
                <input
                    id={inputId}
                    type="text"
                    // Capped, and `parseTimestamp` says the same thing about a
                    // value arriving from a shared link. No meter: nothing this
                    // reads is anywhere near 200 characters.
                    maxLength={MAX_INPUT_LENGTH}
                    value={value}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder={t("inputPlaceholder")}
                    aria-describedby={statusId}
                    aria-invalid={statusTone === "error"}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-12 min-w-0 flex-1 bg-transparent px-1.5 font-mono text-base outline-none sm:text-lg"
                />
                {value.length > 0 && (
                    <button
                        type="button"
                        onClick={onClear}
                        aria-label={t("clear")}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                    </button>
                )}
            </div>

            <StatusStrip
                id={statusId}
                tone={statusTone}
                message={statusMessage}
                className="min-h-4"
            />

            <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground mr-0.5 text-[0.6875rem] leading-[1.4]">
                    {t("examplesLabel")}
                </span>
                <div
                    role="group"
                    aria-label={t("examplesLabel")}
                    className="flex flex-wrap items-center gap-1"
                >
                    {EXAMPLE_INPUTS.map((example) => (
                        <button
                            key={example.key}
                            type="button"
                            title={example.value}
                            aria-pressed={value === example.value}
                            onClick={() => onChange(example.value)}
                            className={cn(
                                "h-7 rounded-lg px-2 text-[0.6875rem] leading-[1.4] transition-colors duration-200",
                                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                value === example.value
                                    ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                    : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                            )}
                        >
                            {t(`examples.${example.key}`)}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

type ReadingOptionsProps = {
    unit: EpochUnit;
    inputTimeZone: string;
    inputRegion: string;
    /** True once the reading came from the input zone rather than the input itself. */
    zoneApplies: boolean;
    onUnitChange: (unit: EpochUnit) => void;
    onInputRegionChange: (region: string) => void;
    onInputTimeZoneChange: (timeZone: string) => void;
};

/**
 * How the input is read, rather than what comes out of it. Kept in its own
 * muted panel with a heading of its own: the page carries two region-and-city
 * pickers, and without a label saying which is which, the one that decides how
 * a zone-less string is *read* is indistinguishable from the one that adds a
 * zone to the comparison board.
 */
export function ReadingOptions({
    unit,
    inputTimeZone,
    inputRegion,
    zoneApplies,
    onUnitChange,
    onInputRegionChange,
    onInputTimeZoneChange,
}: ReadingOptionsProps) {
    const t = useTranslations("timestamp.workbench");

    const unitItems = Object.fromEntries(EPOCH_UNITS.map((id) => [id, t(`units.${id}`)]));

    return (
        <section
            aria-label={t("readingOptionsTitle")}
            className="bg-muted/40 ring-border/60 flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4"
        >
            <div className="flex items-center gap-1.5">
                <IconAdjustmentsHorizontal
                    className="text-muted-foreground size-3.5 shrink-0"
                    stroke={1.9}
                    aria-hidden="true"
                />
                <h3 className="text-[0.8125rem] leading-[1.3] font-medium">
                    {t("readingOptionsTitle")}
                </h3>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <OptionSelect<EpochUnit>
                    label={t("unitLabel")}
                    hint={unit === "auto" ? t("unitHintAuto") : t("unitHintExplicit")}
                    value={unit}
                    items={unitItems}
                    values={EPOCH_UNITS}
                    onChange={onUnitChange}
                />

                <div className="flex min-w-0 flex-col gap-1.5">
                    <ZonePicker
                        region={inputRegion}
                        timeZone={inputTimeZone}
                        regionLabel={t("inputZoneRegionLabel")}
                        cityLabel={t("inputZoneCityLabel")}
                        onRegionChange={onInputRegionChange}
                        onTimeZoneChange={onInputTimeZoneChange}
                    />
                    <p
                        className={cn(
                            "text-[0.6875rem] leading-[1.4]",
                            zoneApplies ? "text-primary" : "text-muted-foreground",
                        )}
                    >
                        {zoneApplies ? t("inputZoneApplied") : t("inputZoneIdle")}
                    </p>
                </div>
            </div>
        </section>
    );
}
