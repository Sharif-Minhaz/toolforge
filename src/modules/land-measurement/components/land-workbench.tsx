"use client";

import { IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import {
    OptionsDisclosure,
    RESULT_TRAY,
    StepLabel,
} from "@/modules/tools/components/workbench-step";
import { copyText } from "@/modules/tools/domain/clipboard";
import {
    BIGHA_REGION_DECIMALS,
    KANI_REGION_DECIMALS,
    MAX_AREA_SQUARE_FEET,
    MAX_LAND_INPUT_LENGTH,
    SQUARE_METERS_PER_SQUARE_FOOT,
    UNIT_GROUPS,
} from "../domain/constants";
import { convertLand } from "../domain/convert";
import { fractionDigitsFor } from "../domain/precision";
import { regionOf, squareFeetPerUnit } from "../domain/units";
import {
    BIGHA_REGIONS,
    KANI_REGIONS,
    LAND_UNIT_GROUPS,
    LAND_UNITS,
    type LandFailure,
    type LandOptions,
    type LandUnit,
} from "../types";
import { SizeComparison } from "./size-comparison";
import { UnitRow } from "./unit-row";

type LandWorkbenchProps = {
    initialValue: string;
    initialOptions: LandOptions;
};

export function LandWorkbench({ initialValue, initialOptions }: LandWorkbenchProps) {
    const t = useTranslations("landMeasurement.workbench");
    const tErrors = useTranslations("landMeasurement.errors");
    const tToast = useTranslations("landMeasurement.toast");
    const formatter = useFormatter();

    const inputId = useId();
    const hintId = useId();
    const statusId = useId();

    const [value, setValue] = useState(initialValue);
    const [options, setOptions] = useState<LandOptions>(initialOptions);
    const [copied, markCopied] = useCopyFeedback<LandUnit>();

    // Not capped: a number cut short by the field is a different area. The
    // domain refuses past the ceiling and the meter warns before it.
    const inputLimit = useInputLimit(value.length, MAX_LAND_INPUT_LENGTH);

    // The typed number settles; the unit and the regions apply at once.
    const settledValue = useDebouncedValue(value);
    const pending = settledValue !== value;

    // Pure and deterministic, so the server-rendered pass already holds every figure.
    const result = convertLand(settledValue, options);

    function patch(next: Partial<LandOptions>) {
        setOptions((current) => ({ ...current, ...next }));
    }

    function formatArea(area: number): string {
        return formatter.number(area, { maximumFractionDigits: fractionDigitsFor(area) });
    }

    function describeFailure(failure: LandFailure): string {
        const position = formatter.number(failure.position ?? 0);

        switch (failure.reason) {
            case "empty":
                return t("statusEmpty");
            case "invalid_character":
                return tErrors("invalidCharacter", { position });
            case "misplaced_separator":
                return tErrors("misplacedSeparator", { position });
            case "too_many_points":
                return tErrors("tooManyPoints", { position });
            case "no_digits":
                return tErrors("noDigits");
            case "negative":
                return tErrors("negative");
            case "too_large":
                return tErrors("tooLarge", {
                    max: formatter.number(
                        (MAX_AREA_SQUARE_FEET * SQUARE_METERS_PER_SQUARE_FOOT) / 1_000_000,
                        { maximumFractionDigits: 0 },
                    ),
                });
        }
    }

    const status: { tone: StatusTone; message: string } = result.ok
        ? {
              tone: "success",
              message: t("statusReady", {
                  value: formatArea(result.value),
                  unit: t(`units.${options.unit}.short`),
                  squareFeet: formatArea(result.squareFeet),
              }),
          }
        : {
              tone: result.reason === "empty" ? "idle" : "error",
              message: describeFailure(result),
          };

    async function handleCopy(unit: LandUnit, figure: string) {
        const copiedText = await copyText(`${figure} ${t(`units.${unit}.short`)}`);

        if (!copiedText.ok) {
            const message =
                copiedText.reason === "empty"
                    ? tToast("copyFailedEmpty")
                    : copiedText.reason === "unsupported"
                      ? tToast("copyFailedUnsupported")
                      : tToast("copyFailedDenied");

            toast.error(message);

            return;
        }

        markCopied(unit);
        toast.success(tToast("copied"));
    }

    function regionTag(unit: LandUnit): string | null {
        const chain = regionOf(unit);

        if (chain === "bigha" && options.bighaRegion !== "standard") {
            return t("regionTag", { region: t(`regions.${options.bighaRegion}`) });
        }

        if (chain === "kani" && options.kaniRegion !== "standard") {
            return t("regionTag", { region: t(`regions.${options.kaniRegion}`) });
        }

        return null;
    }

    const unitItems = Object.fromEntries(LAND_UNITS.map((unit) => [unit, t(`units.${unit}.name`)]));
    const bighaItems = Object.fromEntries(
        BIGHA_REGIONS.map((region) => [
            region,
            t("regionOption", {
                name: t(`regions.${region}`),
                decimals: formatter.number(BIGHA_REGION_DECIMALS[region], {
                    maximumFractionDigits: 2,
                }),
            }),
        ]),
    );
    const kaniItems = Object.fromEntries(
        KANI_REGIONS.map((region) => [
            region,
            t("regionOption", {
                name: t(`regions.${region}`),
                decimals: formatter.number(KANI_REGION_DECIMALS[region], {
                    maximumFractionDigits: 2,
                }),
            }),
        ]),
    );

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                        <StepLabel step={1} htmlFor={inputId}>
                            {t("inputLabel")}
                        </StepLabel>
                        <div className="flex items-center gap-1.5">
                            <InputLimitMeter reading={inputLimit} />
                            <button
                                type="button"
                                onClick={() => setValue("")}
                                disabled={value.length === 0}
                                aria-label={t("clear")}
                                className={cn(
                                    buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                    "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    {/* One row: the number and the unit it is in read as a
                        single phrase, "5 কাঠা", so they sit together at the
                        same height rather than as two separate fields. */}
                    <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex min-w-0 gap-2">
                            <Input
                                id={inputId}
                                value={value}
                                onChange={(event) => setValue(event.target.value)}
                                placeholder={t("placeholder")}
                                inputMode="decimal"
                                spellCheck={false}
                                autoComplete="off"
                                aria-invalid={!result.ok && result.reason !== "empty"}
                                aria-describedby={`${hintId} ${statusId}`}
                                className="h-9 min-w-0 flex-1 font-mono tabular-nums"
                            />
                            <Select
                                items={unitItems}
                                value={options.unit}
                                onValueChange={(unit) => {
                                    if (unit !== null) {
                                        patch({ unit });
                                    }
                                }}
                            >
                                <SelectTrigger
                                    aria-label={t("unitLabel")}
                                    className="w-40 shrink-0 data-[size=default]:h-9 sm:w-56"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    {LAND_UNITS.map((unit) => (
                                        <SelectItem key={unit} value={unit}>
                                            {t(`units.${unit}.name`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p
                            id={hintId}
                            className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                        >
                            {t("inputHint")}
                        </p>
                    </div>

                    <OptionsDisclosure label={t("regionsLabel")}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <OptionSelect
                                label={t("bighaRegionLabel")}
                                hint={t("bighaRegionHint")}
                                value={options.bighaRegion}
                                items={bighaItems}
                                values={BIGHA_REGIONS}
                                onChange={(bighaRegion) => patch({ bighaRegion })}
                            />
                            <OptionSelect
                                label={t("kaniRegionLabel")}
                                hint={t("kaniRegionHint")}
                                value={options.kaniRegion}
                                items={kaniItems}
                                values={KANI_REGIONS}
                                onChange={(kaniRegion) => patch({ kaniRegion })}
                            />
                        </div>
                    </OptionsDisclosure>
                </div>

                <div className={RESULT_TRAY}>
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={2}>{t("outputLabel")}</StepLabel>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        {LAND_UNIT_GROUPS.map((group) => (
                            <section key={group} className="flex min-w-0 flex-col gap-2">
                                <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium">
                                    {t(`groups.${group}`)}
                                </h3>
                                <ul className="flex flex-col gap-1.5">
                                    {LAND_UNITS.filter((unit) => UNIT_GROUPS[unit] === group).map(
                                        (unit) => {
                                            const conversion = result.ok
                                                ? result.conversions.find(
                                                      (row) => row.unit === unit,
                                                  )
                                                : undefined;
                                            const figure =
                                                conversion === undefined
                                                    ? ""
                                                    : formatArea(conversion.value);
                                            const typed = unit === options.unit;
                                            const region = regionTag(unit);
                                            const tags = [
                                                ...(typed ? [t("typedTag")] : []),
                                                ...(region === null ? [] : [region]),
                                            ];

                                            return (
                                                <UnitRow
                                                    key={unit}
                                                    name={t(`units.${unit}.name`)}
                                                    definition={
                                                        unit === "square-foot"
                                                            ? null
                                                            : t("oneIs", {
                                                                  unit: t(`units.${unit}.short`),
                                                                  value: formatArea(
                                                                      squareFeetPerUnit(
                                                                          unit,
                                                                          options,
                                                                      ),
                                                                  ),
                                                              })
                                                    }
                                                    value={figure}
                                                    tags={tags}
                                                    highlighted={typed}
                                                    copyLabel={t("copyValue", {
                                                        unit: t(`units.${unit}.short`),
                                                    })}
                                                    copied={copied === unit}
                                                    dimmed={pending}
                                                    onCopy={() => handleCopy(unit, figure)}
                                                />
                                            );
                                        },
                                    )}
                                </ul>
                            </section>
                        ))}
                    </div>

                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        className={cn("transition-opacity duration-200", pending && "opacity-55")}
                    />
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={3}>{t("sizeLabel")}</StepLabel>
                    </div>
                    <SizeComparison
                        squareMeters={result.ok ? result.squareMeters : null}
                        pitches={result.ok ? result.pitches : null}
                        dimmed={pending}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
