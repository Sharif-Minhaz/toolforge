"use client";

import { IconCalendarEvent } from "@tabler/icons-react";
import { bn, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import { useState } from "react";
import type { Locale as DayPickerLocale } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MAX_YEAR, MIN_YEAR } from "../domain/constants";
import type { CivilDate } from "../types";

const DAY_PICKER_LOCALES: Record<string, DayPickerLocale> = { en: enUS, bn };

type DatePickerButtonProps = {
    /** The date the field currently reads as, or `null` when it reads as nothing. */
    value: CivilDate | null;
    /** Where the calendar opens when there is no value — a birth date opens decades back. */
    fallbackMonth: CivilDate;
    label: string;
    onPick: (date: CivilDate) => void;
    /** `inset` sits inside a text box; `standalone` stands in a row of 40 px controls. */
    variant?: "inset" | "standalone";
};

function toLocalDate({ year, month, day }: CivilDate): Date {
    return new Date(year, month - 1, day);
}

/**
 * A calendar behind a button, for the reader who would rather point than type.
 * The typed field stays the source of truth: a pick is written back into it as
 * text, and the calendar only ever reads the year, month and day.
 *
 * The calendar reasons in local date components and marks the host's own
 * "today", so it lives inside the popover and only mounts after a click — the
 * same arrangement as `tools/components/date-time-picker.tsx`, and for the same
 * reason: it never takes part in hydration. Month and year are dropdowns,
 * because a date of birth is three hundred months back.
 */
export function DatePickerButton({
    value,
    fallbackMonth,
    label,
    onPick,
    variant = "inset",
}: DatePickerButtonProps) {
    const locale = useLocale();
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={(next) => setOpen(next)}>
            <PopoverTrigger
                aria-label={label}
                className={cn(
                    variant === "inset"
                        ? buttonVariants({ variant: "ghost", size: "icon-sm" })
                        : cn(buttonVariants({ variant: "outline", size: "icon" }), "size-10"),
                    "text-muted-foreground hover:text-foreground",
                )}
            >
                <IconCalendarEvent className="size-4" stroke={1.8} aria-hidden="true" />
            </PopoverTrigger>

            <PopoverContent align="end" className="w-auto p-3">
                <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    selected={value === null ? undefined : toLocalDate(value)}
                    defaultMonth={toLocalDate(value ?? fallbackMonth)}
                    startMonth={new Date(MIN_YEAR, 0, 1)}
                    endMonth={new Date(MAX_YEAR, 11, 31)}
                    locale={DAY_PICKER_LOCALES[locale] ?? enUS}
                    onSelect={(day) => {
                        if (day === undefined) {
                            return;
                        }

                        onPick({
                            year: day.getFullYear(),
                            month: day.getMonth() + 1,
                            day: day.getDate(),
                        });
                        setOpen(false);
                    }}
                    className="p-0"
                />
            </PopoverContent>
        </Popover>
    );
}
