"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { ReadingTile } from "@/modules/tools/components/reading-tile";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import {
    OptionsDisclosure,
    RESULT_TRAY,
    StepLabel,
} from "@/modules/tools/components/workbench-step";
import { calculateAge } from "../domain/calculate";
import {
    COVID_RELAXATION_DATE,
    MAX_LIMIT_YEARS,
    MAX_LIMIT_PRESETS,
    MAX_YEAR,
    MIN_LIMIT_PRESETS,
    MIN_YEAR,
    NO_LIMITS,
} from "../domain/constants";
import { parseLimitInput, validateLimits } from "../domain/eligibility";
import { formatDayFirst, parseDateInput } from "../domain/gregorian";
import type { AgeFields, AgeLimits, AgeResult, CivilDate, DateInputFailure } from "../types";
import { BodyStatsCard } from "./body-stats-card";
import { DateFactsCard } from "./date-facts-card";
import { DateField, FieldAction } from "./date-field";
import { DatePickerButton } from "./date-picker-button";
import { EligibilityReport } from "./eligibility-report";
import { LimitField } from "./limit-field";
import { useCalendarLabels } from "./use-calendar-labels";
import { useClipboardCopy } from "./use-clipboard-copy";

type CopyTarget = "age" | "birth" | "reference" | "relaxation";

type AgePanelProps = {
    today: CivilDate;
    initialFields: AgeFields;
    hijriAdjustment: number;
};

export function AgePanel({ today, initialFields, hijriAdjustment }: AgePanelProps) {
    const t = useTranslations("ageCalculator.workbench");
    const tErrors = useTranslations("ageCalculator.errors");
    const labels = useCalendarLabels();
    const birthId = useId();
    const referenceId = useId();
    const relaxationId = useId();
    const minId = useId();
    const maxId = useId();

    const [fields, setFields] = useState<AgeFields>(initialFields);
    // A press — Today, a preset, the COVID date — is applied at once; only
    // typing waits for the debounce. The press records the object it made, and
    // the derivation reads that object until the next keystroke replaces it.
    const [pressed, setPressed] = useState<AgeFields | null>(null);
    const settled = useDebouncedValue(fields);
    const source = pressed === fields ? fields : settled;
    const pending = source !== fields;

    const [copied, markCopied] = useCopyFeedback<CopyTarget>();
    const copy = useClipboardCopy();

    function type(next: Partial<AgeFields>) {
        setFields((current) => ({ ...current, ...next }));
    }

    function press(next: Partial<AgeFields>) {
        const updated = { ...fields, ...next };

        setFields(updated);
        setPressed(updated);
    }

    const minInput = parseLimitInput(source.min);
    const maxInput = parseLimitInput(source.max);
    const limits: AgeLimits = {
        minYears: minInput.ok ? minInput.years : null,
        maxYears: maxInput.ok ? maxInput.years : null,
    };

    // A limit that cannot be checked is reported beside the limit, and the age
    // is still worked out without it.
    const limitFailure = validateLimits(limits);

    // Pure and deterministic, so the server-rendered pass already holds the age.
    const result: AgeResult = calculateAge({
        birth: source.birth,
        reference: source.reference,
        limits: limitFailure === null ? limits : NO_LIMITS,
        relaxation: source.relaxation,
        hijriAdjustment,
    });

    function dateError(reason: DateInputFailure): string {
        switch (reason) {
            case "empty":
                return tErrors("date.empty");
            case "invalid_format":
                return tErrors("date.invalidFormat");
            case "invalid_date":
                return tErrors("date.invalidDate");
            case "out_of_range":
                return tErrors("date.outOfRange", {
                    min: labels.digits(MIN_YEAR),
                    max: labels.digits(MAX_YEAR),
                });
        }
    }

    function fieldError(field: "invalid_birth" | "invalid_reference" | "invalid_relaxation") {
        if (result.ok || result.reason !== field || result.dateReason === undefined) {
            return null;
        }

        // An empty date of birth is the starting state, not a mistake.
        if (field === "invalid_birth" && result.dateReason === "empty") {
            return null;
        }

        return dateError(result.dateReason);
    }

    const limitError = (input: typeof minInput) =>
        input.ok ? null : tErrors("limitOutOfRange", { max: labels.digits(MAX_LIMIT_YEARS) });
    const minError =
        limitError(minInput) ?? (limitFailure === "min_above_max" ? tErrors("minAboveMax") : null);

    const todayText = formatDayFirst(today);

    // A link that arrives with a limit or a relaxation date opens the box that
    // holds it, so the reader sees what the eligibility report is checking.
    const limitsOpenOnArrival = [
        initialFields.min,
        initialFields.max,
        initialFields.relaxation,
    ].some((value) => value.trim().length > 0);

    /** The calendar button for one field: opens on what the field reads as, and a pick applies at once. */
    function picker(field: "birth" | "reference" | "relaxation", fallbackMonth: CivilDate) {
        const read = parseDateInput(fields[field]);

        return (
            <DatePickerButton
                value={read.ok ? read.date : null}
                fallbackMonth={fallbackMonth}
                label={t("pickDate")}
                onPick={(date) => press({ [field]: formatDayFirst(date) })}
            />
        );
    }
    const ageText = result.ok
        ? t("ageSpan", {
              years: result.age.years,
              months: result.age.months,
              days: result.age.days,
          })
        : "";

    function handleCopy(target: CopyTarget, text: string) {
        void copy(text).then((ok) => {
            if (ok) {
                markCopied(target);
            }
        });
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
                <StepLabel step={1} htmlFor={birthId}>
                    {t("datesLabel")}
                </StepLabel>

                <div className="grid gap-4 sm:grid-cols-2">
                    <DateField
                        id={birthId}
                        label={t("birthLabel")}
                        value={fields.birth}
                        placeholder={t("datePlaceholder")}
                        hint={t("dateHint")}
                        error={fieldError("invalid_birth")}
                        // A birth date is decades back; open where most readers are.
                        picker={picker("birth", { ...today, year: today.year - 25 })}
                        onChange={(birth) => type({ birth })}
                    />
                    <DateField
                        id={referenceId}
                        label={t("referenceLabel")}
                        value={fields.reference}
                        placeholder={t("datePlaceholder")}
                        hint={t("referenceHint", { today: labels.gregorianShort(today) })}
                        error={fieldError("invalid_reference")}
                        actions={
                            <FieldAction
                                pressed={fields.reference.trim() === todayText}
                                onClick={() => press({ reference: todayText })}
                            >
                                {t("today")}
                            </FieldAction>
                        }
                        picker={picker("reference", today)}
                        onChange={(reference) => type({ reference })}
                    />
                </div>

                <OptionsDisclosure label={t("limitsLabel")} defaultOpen={limitsOpenOnArrival}>
                    <fieldset className="flex min-w-0 flex-col gap-4">
                        <legend className="sr-only">{t("limitsLabel")}</legend>
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("limitsHint")}
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <LimitField
                                id={minId}
                                label={t("minLabel")}
                                value={fields.min}
                                presets={MIN_LIMIT_PRESETS}
                                presetsLabel={t("presetsLabel")}
                                hint={t("limitHint")}
                                error={minError}
                                formatPreset={labels.digits}
                                onChange={(min) => type({ min })}
                                onPreset={(min) => press({ min })}
                            />
                            <LimitField
                                id={maxId}
                                label={t("maxLabel")}
                                value={fields.max}
                                presets={MAX_LIMIT_PRESETS}
                                presetsLabel={t("presetsLabel")}
                                hint={t("limitHint")}
                                error={limitError(maxInput)}
                                formatPreset={labels.digits}
                                onChange={(max) => type({ max })}
                                onPreset={(max) => press({ max })}
                            />
                        </div>
                        <DateField
                            id={relaxationId}
                            label={t("relaxationLabel")}
                            value={fields.relaxation}
                            placeholder={t("datePlaceholder")}
                            hint={t("relaxationHint")}
                            error={fieldError("invalid_relaxation")}
                            actions={
                                <>
                                    <FieldAction
                                        pressed={fields.relaxation.trim() === COVID_RELAXATION_DATE}
                                        onClick={() => press({ relaxation: COVID_RELAXATION_DATE })}
                                    >
                                        {t("covidPreset")}
                                    </FieldAction>
                                    {fields.relaxation.length > 0 && (
                                        <FieldAction onClick={() => press({ relaxation: "" })}>
                                            {t("clearField")}
                                        </FieldAction>
                                    )}
                                </>
                            }
                            picker={picker("relaxation", today)}
                            onChange={(relaxation) => type({ relaxation })}
                        />
                    </fieldset>
                </OptionsDisclosure>
            </div>

            <div className={RESULT_TRAY}>
                <div className="flex min-h-7 items-center">
                    <StepLabel step={2}>{t("outputLabel")}</StepLabel>
                </div>

                {result.ok ? (
                    <>
                        <section
                            className={cn(
                                "bg-card ring-border/70 flex min-w-0 flex-col gap-3 rounded-lg p-3 ring-1 ring-inset sm:p-4",
                                "transition-opacity duration-200",
                                pending && "opacity-55",
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium">
                                    {t("ageLabel", {
                                        date: labels.gregorianShort(result.reference.gregorian),
                                    })}
                                </h3>
                                <IconCopyButton
                                    copied={copied === "age"}
                                    onClick={() => handleCopy("age", ageText)}
                                    aria-label={t("copyAge")}
                                />
                            </div>
                            <p className="text-xl leading-[1.4] font-semibold tracking-tight sm:text-2xl">
                                {ageText}
                            </p>
                            <dl className="grid grid-cols-3 gap-2">
                                <ReadingTile
                                    label={t("totalMonths")}
                                    value={labels.number(result.totals.months)}
                                />
                                <ReadingTile
                                    label={t("totalWeeks")}
                                    value={labels.number(result.totals.weeks)}
                                />
                                <ReadingTile
                                    label={t("totalDays")}
                                    value={labels.number(result.totals.days)}
                                />
                            </dl>
                            <p className="text-[0.8125rem] leading-[1.5]">
                                <span className="text-muted-foreground">
                                    {t("nextBirthdayLabel")}:{" "}
                                </span>
                                {result.nextBirthday.daysUntil === 0
                                    ? t("birthdayToday", { age: result.nextBirthday.turning })
                                    : t("nextBirthdayValue", {
                                          date: labels.gregorian(result.nextBirthday.date),
                                          age: result.nextBirthday.turning,
                                          days: result.nextBirthday.daysUntil,
                                      })}
                            </p>
                        </section>

                        <BodyStatsCard
                            body={result.body}
                            reference={result.reference.gregorian}
                            labels={labels}
                            dimmed={pending}
                        />

                        {result.eligibility !== null && (
                            <EligibilityReport
                                eligibility={result.eligibility}
                                reference={result.reference.gregorian}
                                relaxation={result.relaxation?.gregorian ?? null}
                                labels={labels}
                                dimmed={pending}
                            />
                        )}

                        <div className="grid gap-3 lg:grid-cols-2">
                            <DateFactsCard
                                title={t("bornOnLabel")}
                                facts={result.birth}
                                labels={labels}
                                copyLabel={t("copyDates")}
                                copied={copied === "birth"}
                                dimmed={pending}
                                onCopy={(text) => handleCopy("birth", text)}
                            />
                            <DateFactsCard
                                title={t("referenceOnLabel")}
                                facts={result.reference}
                                labels={labels}
                                copyLabel={t("copyDates")}
                                copied={copied === "reference"}
                                dimmed={pending}
                                onCopy={(text) => handleCopy("reference", text)}
                            />
                            {result.relaxation !== null && (
                                <DateFactsCard
                                    title={t("relaxationOnLabel")}
                                    facts={result.relaxation}
                                    labels={labels}
                                    copyLabel={t("copyDates")}
                                    copied={copied === "relaxation"}
                                    dimmed={pending}
                                    onCopy={(text) => handleCopy("relaxation", text)}
                                />
                            )}
                        </div>

                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("hijriNote")}
                        </p>
                    </>
                ) : (
                    <p
                        role="status"
                        className={cn(
                            "text-[0.8125rem] leading-[1.5]",
                            result.reason === "birth_after_reference"
                                ? "text-destructive"
                                : "text-muted-foreground",
                        )}
                    >
                        {result.reason === "birth_after_reference"
                            ? tErrors("birthAfterReference")
                            : t("emptyResult")}
                    </p>
                )}
            </div>
        </div>
    );
}
