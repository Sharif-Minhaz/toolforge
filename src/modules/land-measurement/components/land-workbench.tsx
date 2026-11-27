"use client";

import { IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { SegmentedControl } from "@/modules/tools/components/segmented-control";
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
import { buildSummary } from "../domain/summary";
import { regionOf, squareFeetPerUnit } from "../domain/units";
import {
    BIGHA_REGIONS,
    KANI_REGIONS,
    LAND_UNIT_GROUPS,
    LAND_UNITS,
    type LandFailure,
    type LandOptions,
    type LandUnit,
    type LandUnitGroup,
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
    const groupLabelId = useId();
    const groupIndicatorId = useId();

    const [value, setValue] = useState(initialValue);
    const [options, setOptions] = useState<LandOptions>(initialOptions);
    // Below `lg` one group shows at a time; from `lg` both sit side by side
    // and this is ignored. A constant start, so server and client agree.
    const [visibleGroup, setVisibleGroup] = useState<LandUnitGroup>("local");
    const [copied, markCopied] = useCopyFeedback<LandUnit | "all">();

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

    async function copyAndConfirm(key: LandUnit | "all", text: string, confirmation: string) {
        const copiedText = await copyText(text);

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

        markCopied(key);
        toast.success(confirmation);
    }

    function figureFor(unit: LandUnit): string {
        const conversion = result.ok
            ? result.conversions.find((row) => row.unit === unit)
            : undefined;

        return conversion === undefined ? "" : formatArea(conversion.value);
    }

    function summaryText(): string {
        if (!result.ok) {
            return "";
        }

        return buildSummary(
            t("summaryHeading", {
                value: formatArea(result.value),
                unit: t(`units.${options.unit}.short`),
            }),
            options.unit,
            LAND_UNITS.map((unit) => ({
                unit,
                figure: figureFor(unit),
                short: t(`units.${unit}.short`),
                region: regionTag(unit),
            })),
        );
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

    const groupOptions = LAND_UNIT_GROUPS.map((group) => ({
        value: group,
        label: t(`groups.${group}`),
    }));

    return (
        // `overflow-visible` overrides the vendor Card's `overflow-hidden`, which
        // would otherwise become the sticky input row's scroll container and
        // leave it nothing to slide against.
        <Card className="overflow-visible [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-3">
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

                {/* One row: the number and the unit it is in read as a single
                    phrase, "5 কাঠা", so they sit together at the same height.
                    On a phone the row stays pinned under the site header while
                    the figures scroll beneath it, so a reader can change the
                    area without scrolling back up. It is a direct child of the
                    card's content on purpose: a sticky element only slides
                    within its parent. The negative margin carries its
                    background to the card's edges. */}
                <div className="bg-card -mx-5 flex min-w-0 gap-2 px-5 max-lg:sticky max-lg:top-14 max-lg:z-20 max-lg:-my-2 max-lg:py-2 sm:-mx-6 sm:px-6">
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
                        className="h-10 min-w-0 flex-1 font-mono text-base tabular-nums lg:h-9 lg:text-sm"
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
                            className="w-40 shrink-0 data-[size=default]:h-10 sm:w-56 lg:data-[size=default]:h-9"
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

                <div className="flex flex-col gap-3">
                    <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("inputHint")}
                    </p>

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

                <div className={cn(RESULT_TRAY, "mt-3")}>
                    <div className="flex min-h-7 items-center justify-between gap-2">
                        <StepLabel step={2}>{t("outputLabel")}</StepLabel>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!result.ok}
                            onClick={() =>
                                copyAndConfirm("all", summaryText(), tToast("copiedAll"))
                            }
                        >
                            <CopyIconSwap copied={copied === "all"} />
                            {t("copyAll")}
                        </Button>
                    </div>

                    {/* A phone shows one group at a time rather than seventeen
                        rows stacked; from `lg` both columns fit side by side
                        and the switch goes away. Both groups are always in the
                        markup, so nothing differs between server and client. */}
                    <div className="lg:hidden">
                        <span id={groupLabelId} className="sr-only">
                            {t("groupsLabel")}
                        </span>
                        <SegmentedControl
                            options={groupOptions}
                            value={visibleGroup}
                            onChange={setVisibleGroup}
                            labelId={groupLabelId}
                            layoutId={`land-group-${groupIndicatorId}`}
                            size="sm"
                        />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        {LAND_UNIT_GROUPS.map((group) => (
                            <section
                                key={group}
                                className={cn(
                                    "flex min-w-0 flex-col gap-2",
                                    group !== visibleGroup && "max-lg:hidden",
                                )}
                            >
                                {/* The group's name, and on the right the unit
                                    the figures were typed in. The switch names
                                    the group on a phone, so there the heading
                                    stays for assistive tech only. */}
                                <div className="flex min-h-4 items-center justify-between gap-2">
                                    <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium max-lg:sr-only">
                                        {t(`groups.${group}`)}
                                    </h3>
                                    <span className="text-muted-foreground ml-auto text-xs leading-[1.3] font-medium">
                                        {t(`units.${options.unit}.label`)}
                                    </span>
                                </div>
                                <ul className="flex flex-col gap-1.5">
                                    {LAND_UNITS.filter((unit) => UNIT_GROUPS[unit] === group).map(
                                        (unit) => {
                                            const figure = figureFor(unit);
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
                                                    onCopy={() =>
                                                        copyAndConfirm(
                                                            unit,
                                                            `${figure} ${t(`units.${unit}.short`)}`,
                                                            tToast("copied"),
                                                        )
                                                    }
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

                {/* Not a numbered step: the path through the tool ends at the
                    figures, and this is an aside about them. */}
                <section className="mt-3 flex flex-col gap-3">
                    <h3 className="flex min-h-7 items-center text-sm font-medium">
                        {t("sizeLabel")}
                    </h3>
                    <SizeComparison
                        squareMeters={result.ok ? result.squareMeters : null}
                        pitches={result.ok ? result.pitches : null}
                        dimmed={pending}
                    />
                </section>
            </CardContent>
        </Card>
    );
}
