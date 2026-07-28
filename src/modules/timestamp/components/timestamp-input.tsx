"use client";

import { IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { EXAMPLE_INPUTS } from "../domain/constants";
import { EPOCH_UNITS, type EpochUnit } from "../types";
import { ZonePicker } from "./zone-picker";

type TimestampInputProps = {
    value: string;
    unit: EpochUnit;
    inputTimeZone: string;
    inputRegion: string;
    inputId: string;
    statusId: string;
    statusTone: StatusTone;
    statusMessage: string;
    /** True once the reading came from the input zone rather than the input itself. */
    zoneApplies: boolean;
    onChange: (value: string) => void;
    onUnitChange: (unit: EpochUnit) => void;
    onInputRegionChange: (region: string) => void;
    onInputTimeZoneChange: (timeZone: string) => void;
    onClear: () => void;
};

export function TimestampInput({
    value,
    unit,
    inputTimeZone,
    inputRegion,
    inputId,
    statusId,
    statusTone,
    statusMessage,
    zoneApplies,
    onChange,
    onUnitChange,
    onInputRegionChange,
    onInputTimeZoneChange,
    onClear,
}: TimestampInputProps) {
    const t = useTranslations("timestamp.workbench");

    const unitItems = Object.fromEntries(EPOCH_UNITS.map((id) => [id, t(`units.${id}`)]));

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t("inputLabel")}</span>
                    </Label>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        disabled={value.length === 0}
                        className="h-7 px-2"
                    >
                        <IconX className="size-3.5" stroke={2} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                </div>

                <Input
                    id={inputId}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={t("inputPlaceholder")}
                    spellCheck={false}
                    autoComplete="off"
                    aria-describedby={statusId}
                    aria-invalid={statusTone === "error"}
                    className="h-11 rounded-xl font-mono text-[0.9375rem]"
                />

                <StatusStrip
                    id={statusId}
                    tone={statusTone}
                    message={statusMessage}
                    className="min-h-4"
                />
            </div>

            <div
                role="group"
                aria-label={t("examplesLabel")}
                className="flex flex-wrap items-center gap-1"
            >
                <span className="text-muted-foreground mr-0.5 text-[0.6875rem] leading-[1.4]">
                    {t("examplesLabel")}
                </span>
                {EXAMPLE_INPUTS.map((example) => (
                    <button
                        key={example}
                        type="button"
                        onClick={() => onChange(example)}
                        className={cn(
                            "ring-border/70 text-muted-foreground h-7 max-w-full truncate rounded-lg px-2 font-mono text-[0.6875rem] ring-1 ring-inset",
                            "hover:bg-muted hover:text-foreground transition-colors duration-200",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                        )}
                    >
                        {example}
                    </button>
                ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
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
        </div>
    );
}
