"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";
import { convertDate, describeDate, expressIn } from "../domain/calculate";
import { MAX_YEAR, MIN_YEAR } from "../domain/constants";
import { parseWholeNumber } from "../domain/gregorian";
import {
    CALENDARS,
    type CalendarId,
    type CivilDate,
    type ConvertFields,
    type ConvertResult,
} from "../types";
import { DateFactsCard } from "./date-facts-card";
import { FieldAction } from "./date-field";
import { DatePickerButton } from "./date-picker-button";
import { SegmentedControl } from "./segmented-control";
import { useCalendarLabels } from "./use-calendar-labels";
import { useClipboardCopy } from "./use-clipboard-copy";

const MONTH_NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

type ConvertPanelProps = {
    today: CivilDate;
    initialFields: ConvertFields;
    hijriAdjustment: number;
};

function readNumber(text: string): number {
    const value = parseWholeNumber(text);

    // Blank and non-digits both make a day no calendar has.
    return value === null ? Number.NaN : value;
}

export function ConvertPanel({ today, initialFields, hijriAdjustment }: ConvertPanelProps) {
    const t = useTranslations("ageCalculator.workbench");
    const tErrors = useTranslations("ageCalculator.errors");
    const labels = useCalendarLabels();
    const dayId = useId();
    const yearId = useId();
    const errorId = useId();
    const calendarLabelId = useId();
    const monthLabelId = useId();

    const [fields, setFields] = useState<ConvertFields>(initialFields);
    // As on the age side: picks apply at once, typing waits for the debounce.
    const [pressed, setPressed] = useState<ConvertFields | null>(null);
    const settled = useDebouncedValue(fields);
    const source = pressed === fields ? fields : settled;
    const pending = source !== fields;

    const [copied, markCopied] = useCopyFeedback<"date">();
    const copy = useClipboardCopy();

    const result: ConvertResult = convertDate(
        {
            calendar: source.calendar,
            day: readNumber(source.day),
            month: source.month,
            year: readNumber(source.year),
        },
        hijriAdjustment,
    );

    function press(next: ConvertFields) {
        setFields(next);
        setPressed(next);
    }

    function fromFacts(calendar: CalendarId, date: CivilDate): ConvertFields {
        const expressed = expressIn(describeDate(date, hijriAdjustment), calendar);

        return {
            calendar,
            day: String(expressed.day),
            month: expressed.month,
            year: String(expressed.year),
        };
    }

    function switchCalendar(calendar: CalendarId) {
        // Keep the day on screen, re-expressed; fall back to today when the
        // fields do not name a day yet.
        press(fromFacts(calendar, result.ok ? result.facts.gregorian : today));
    }

    const monthItems: Record<string, string> = Object.fromEntries(
        MONTH_NUMBERS.map((month) => [month, labels.monthName(fields.calendar, Number(month))]),
    );

    const error = result.ok
        ? null
        : result.reason === "invalid_date"
          ? tErrors("convertInvalidDate")
          : tErrors("convertOutOfRange", {
                min: labels.digits(MIN_YEAR),
                max: labels.digits(MAX_YEAR),
            });

    const todayFields = fromFacts(fields.calendar, today);
    const isToday =
        fields.day === todayFields.day &&
        fields.month === todayFields.month &&
        fields.year === todayFields.year;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
                <StepLabel step={1} htmlFor={dayId}>
                    {t("convert.inputLabel")}
                </StepLabel>

                <div className="flex max-w-xl flex-col gap-2">
                    <span
                        id={calendarLabelId}
                        className="text-muted-foreground text-xs leading-[1.3]"
                    >
                        {t("convert.calendarLabel")}
                    </span>
                    <SegmentedControl
                        size="sm"
                        options={CALENDARS.map((calendar) => ({
                            value: calendar,
                            label: t(`calendars.${calendar}`),
                        }))}
                        value={fields.calendar}
                        labelId={calendarLabelId}
                        layoutId="age-calculator-calendar-indicator"
                        onChange={switchCalendar}
                    />
                </div>

                <div className="flex max-w-xl flex-col gap-2">
                    <div className="flex items-end gap-2">
                        <div className="grid min-w-0 flex-1 grid-cols-[4rem_minmax(0,1fr)_5.5rem] gap-2">
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <Label htmlFor={dayId} className="text-muted-foreground text-xs">
                                    <span className="leading-[1.3]">{t("convert.dayLabel")}</span>
                                </Label>
                                <Input
                                    id={dayId}
                                    value={fields.day}
                                    onChange={(event) =>
                                        setFields((current) => ({
                                            ...current,
                                            day: event.target.value,
                                        }))
                                    }
                                    inputMode="numeric"
                                    maxLength={2}
                                    autoComplete="off"
                                    aria-invalid={error !== null}
                                    aria-describedby={errorId}
                                    className="h-10 text-center font-mono tabular-nums"
                                />
                            </div>
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <span
                                    id={monthLabelId}
                                    className="text-muted-foreground text-xs leading-[1.3]"
                                >
                                    {t("convert.monthLabel")}
                                </span>
                                <Select
                                    items={monthItems}
                                    value={String(fields.month)}
                                    onValueChange={(month) => {
                                        if (month !== null) {
                                            press({ ...fields, month: Number(month) });
                                        }
                                    }}
                                >
                                    {/* Same prefix as the vendor's own height, or it would win. */}
                                    <SelectTrigger
                                        aria-labelledby={monthLabelId}
                                        className="w-full data-[size=default]:h-10"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        {MONTH_NUMBERS.map((month) => (
                                            <SelectItem key={month} value={month}>
                                                <span className="text-muted-foreground w-5 font-mono text-xs tabular-nums">
                                                    {labels.digits(Number(month))}
                                                </span>
                                                {monthItems[month]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <Label htmlFor={yearId} className="text-muted-foreground text-xs">
                                    <span className="leading-[1.3]">{t("convert.yearLabel")}</span>
                                </Label>
                                <Input
                                    id={yearId}
                                    value={fields.year}
                                    onChange={(event) =>
                                        setFields((current) => ({
                                            ...current,
                                            year: event.target.value,
                                        }))
                                    }
                                    inputMode="numeric"
                                    maxLength={4}
                                    autoComplete="off"
                                    aria-invalid={error !== null}
                                    aria-describedby={errorId}
                                    className="h-10 text-center font-mono tabular-nums"
                                />
                            </div>
                        </div>
                        {/* Picks a day on the English calendar and writes it back
                            in whichever calendar is selected. */}
                        <DatePickerButton
                            variant="standalone"
                            value={result.ok ? result.facts.gregorian : null}
                            fallbackMonth={today}
                            label={t("pickDate")}
                            onPick={(date) => press(fromFacts(fields.calendar, date))}
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                            id={errorId}
                            className={cn(
                                "text-[0.6875rem] leading-[1.4]",
                                error === null ? "text-muted-foreground" : "text-destructive",
                            )}
                        >
                            {error ?? t(`convert.hints.${fields.calendar}`)}
                        </p>
                        <FieldAction pressed={isToday} onClick={() => press(todayFields)}>
                            {t("today")}
                        </FieldAction>
                    </div>
                </div>
            </div>

            <div className={RESULT_TRAY}>
                <div className="flex min-h-7 items-center">
                    <StepLabel step={2}>{t("convert.outputLabel")}</StepLabel>
                </div>

                {result.ok ? (
                    <>
                        <DateFactsCard
                            title={t("convert.cardTitle")}
                            facts={result.facts}
                            labels={labels}
                            copyLabel={t("copyDates")}
                            copied={copied === "date"}
                            dimmed={pending}
                            onCopy={(text) =>
                                void copy(text).then((ok) => {
                                    if (ok) {
                                        markCopied("date");
                                    }
                                })
                            }
                        />
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("hijriNote")}
                        </p>
                    </>
                ) : (
                    <p
                        role="status"
                        className="text-muted-foreground text-[0.8125rem] leading-[1.5]"
                    >
                        {t("convert.emptyResult")}
                    </p>
                )}
            </div>
        </div>
    );
}
