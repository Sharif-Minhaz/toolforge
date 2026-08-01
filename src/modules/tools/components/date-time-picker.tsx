"use client";

import { IconCalendarEvent, IconX } from "@tabler/icons-react";
import { bn, enUS } from "date-fns/locale";
import { useFormatter, useLocale } from "next-intl";
import type { Locale as DayPickerLocale } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { parseLocalDateTime } from "../domain/local-datetime";
import { pad2 } from "../domain/zone";

/**
 * A calendar and a clock behind one button, speaking the same
 * `YYYY-MM-DDTHH:mm` string a `datetime-local` input does.
 *
 * Keeping that string as the value is the whole point: it is a wall clock with
 * no offset, which is what the reader actually typed, and
 * `tools/domain/local-datetime.ts` is the only thing that ever attaches a zone
 * to it. Swapping the widget therefore changed no arithmetic and no test.
 *
 * Two host reads are deliberately avoided. The trigger's label is formatted
 * from `Date.UTC` fields **in UTC**, so it renders the typed wall clock
 * identically wherever it runs. And the calendar — which reasons in local date
 * components and highlights the host's own "today" — lives inside the popover,
 * so it only ever mounts after a click, well clear of hydration.
 */

const DAY_PICKER_LOCALES: Record<string, DayPickerLocale> = { en: enUS, bn };

type DateTimePickerProps = {
    /** Points at the trigger, so a sibling `<Label htmlFor>` still works. */
    id?: string;
    /** `YYYY-MM-DDTHH:mm`, or `""` for no value at all. */
    value: string;
    onChange: (value: string) => void;
    /**
     * The time filled in when a day is picked and none has been chosen yet.
     * `00:00` for a start and `23:59` for an end, so "ends on the 9th" means the
     * end of the 9th rather than the instant it began.
     */
    defaultTime: string;
    placeholder: string;
    timeLabel: string;
    clearLabel: string;
    disabled?: boolean;
    "aria-describedby"?: string;
};

export function DateTimePicker({
    id,
    value,
    onChange,
    defaultTime,
    placeholder,
    timeLabel,
    clearLabel,
    disabled = false,
    "aria-describedby": describedBy,
}: DateTimePickerProps) {
    const format = useFormatter();
    const locale = useLocale();

    const fields = parseLocalDateTime(value);
    const time = fields === null ? "" : `${pad2(fields.hour)}:${pad2(fields.minute)}`;

    // Built with the local constructor because that is how a calendar compares
    // days. Only the year, month and day are ever read back out, and those are
    // the same on any host — the instant underneath is never used.
    const selected =
        fields === null ? undefined : new Date(fields.year, fields.month - 1, fields.day);

    const label =
        fields === null
            ? placeholder
            : format.dateTime(
                  new Date(
                      Date.UTC(
                          fields.year,
                          fields.month - 1,
                          fields.day,
                          fields.hour,
                          fields.minute,
                      ),
                  ),
                  { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" },
              );

    function emit(day: Date | undefined, nextTime: string) {
        if (day === undefined) {
            onChange("");

            return;
        }

        const year = String(day.getFullYear()).padStart(4, "0");
        const clock = nextTime.length > 0 ? nextTime : defaultTime;

        onChange(`${year}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}T${clock}`);
    }

    return (
        <Popover>
            <PopoverTrigger
                id={id}
                disabled={disabled}
                aria-describedby={describedBy}
                className={cn(
                    buttonVariants({ variant: "outline" }),
                    "w-full justify-between px-3 font-normal",
                    fields === null && "text-muted-foreground",
                )}
            >
                <span className="min-w-0 truncate">{label}</span>
                <IconCalendarEvent className="size-4 shrink-0" stroke={1.8} aria-hidden="true" />
            </PopoverTrigger>

            <PopoverContent align="start" className="w-auto gap-3 p-3">
                <Calendar
                    mode="single"
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={(day) => emit(day, time)}
                    locale={DAY_PICKER_LOCALES[locale] ?? enUS}
                    className="p-0"
                />

                <div className="border-border/70 flex items-end justify-between gap-2 border-t pt-3">
                    <label className="flex min-w-0 flex-col gap-1">
                        <span className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                            {timeLabel}
                        </span>
                        <Input
                            type="time"
                            value={time}
                            // Nothing to attach a time to until a day exists, so
                            // the field says so by being unavailable rather than
                            // by silently discarding what was typed into it.
                            disabled={selected === undefined}
                            onChange={(event) => emit(selected, event.target.value)}
                            className="h-8 w-32"
                        />
                    </label>

                    <button
                        type="button"
                        onClick={() => emit(undefined, "")}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[0.75rem] leading-[1.3] transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <IconX className="size-3.5" stroke={1.9} aria-hidden="true" />
                        {clearLabel}
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
