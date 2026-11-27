"use client";

import { IconCalendarPlus } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import type { CivilDate, HijriDate } from "@/modules/tools/types";
import { buildHawlCalendar, planHawl } from "../domain/hawl";

const HIJRI_MONTH_KEYS = [
    "muharram",
    "safar",
    "rabiAlAwwal",
    "rabiAlThani",
    "jumadaAlUla",
    "jumadaAlAkhirah",
    "rajab",
    "shaban",
    "ramadan",
    "shawwal",
    "dhuAlQadah",
    "dhuAlHijjah",
] as const;

const ADJUSTMENTS = ["-2", "-1", "0", "1", "2"] as const;

type Adjustment = (typeof ADJUSTMENTS)[number];

/** `YYYY-MM-DD` from a date input, read field by field — never through `new Date`. */
function parseDateInput(value: string): CivilDate | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    return match === null
        ? null
        : { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

const iso = (date: CivilDate) =>
    `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;

type HawlPanelProps = {
    /** Today in Bangladesh, from the server, so both renders agree. */
    today: CivilDate;
};

/**
 * When zakat falls due: the same Hijri date every year from the day wealth
 * first reached nisab. Lists the next five, and writes them into a calendar
 * file with a reminder a week before each.
 */
export function HawlPanel({ today }: HawlPanelProps) {
    const t = useTranslations("zakat.hawl");
    const tMonths = useTranslations("zakat.hijriMonths");
    const formatter = useFormatter();
    const dateId = useId();
    const hintId = useId();

    const [start, setStart] = useState("");
    const [adjustment, setAdjustment] = useState<Adjustment>("0");

    const startDate = parseDateInput(start);
    const plan = startDate === null ? null : planHawl(startDate, today, Number(adjustment));

    const hijri = (date: HijriDate) =>
        t("hijriDate", {
            day: formatter.number(date.day),
            month: tMonths(HIJRI_MONTH_KEYS[date.month - 1]),
            year: formatter.number(date.year, { useGrouping: false }),
        });
    const gregorian = (date: CivilDate) =>
        formatter.dateTime(new Date(Date.UTC(date.year, date.month - 1, date.day, 12)), {
            dateStyle: "full",
            timeZone: "UTC",
        });

    function handleDownload() {
        if (plan === null || !plan.ok) {
            return;
        }

        const seed = Array.from(cryptoRandomBytes(6), (byte) =>
            byte.toString(16).padStart(2, "0"),
        ).join("");
        const content = buildHawlCalendar(
            plan.upcoming,
            {
                summary: t("reminder.summary"),
                description: t("reminder.description", { date: hijri(plan.startHijri) }),
                alarm: t("reminder.alarm"),
            },
            new Date().getTime(),
            seed,
        );
        const filename = "zakat-due-dates.ics";

        try {
            saveFile({ filename, mimeType: "text/calendar;charset=utf-8", content });
            toast.success(t("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "zakat.calendar_download_failed", { error: describeError(caught) });
            toast.error(t("downloadFailed"));
        }
    }

    return (
        <section aria-labelledby={`${dateId}-title`} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
                <h3 id={`${dateId}-title`} className="text-sm font-medium">
                    {t("title")}
                </h3>
                <p className="text-muted-foreground text-[0.75rem] leading-5">{t("intro")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)] sm:items-end">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor={dateId} className="text-xs font-medium">
                        {t("startLabel")}
                    </label>
                    <Input
                        id={dateId}
                        type="date"
                        value={start}
                        max={iso(today)}
                        aria-describedby={hintId}
                        onChange={(event) => setStart(event.target.value)}
                    />
                </div>
                <OptionSelect
                    label={t("adjustment")}
                    value={adjustment}
                    values={ADJUSTMENTS}
                    items={Object.fromEntries(
                        ADJUSTMENTS.map((value) => [
                            value,
                            t("adjustmentDays", {
                                days: formatter.number(Number(value), {
                                    signDisplay: "exceptZero",
                                }),
                            }),
                        ]),
                    )}
                    onChange={setAdjustment}
                />
            </div>
            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {t("startHint")}
            </p>

            {plan !== null && !plan.ok && (
                <p role="alert" className="text-destructive text-[0.75rem]">
                    {t(`errors.${plan.reason}`)}
                </p>
            )}

            {plan !== null && plan.ok && (
                <div className="flex flex-col gap-2">
                    <p className="text-[0.8125rem]">
                        {t("anniversary", {
                            date: hijri(plan.startHijri),
                            years: formatter.number(plan.yearsCompleted),
                        })}
                    </p>
                    <ol className="flex flex-col gap-1.5">
                        {plan.upcoming.map((entry, index) => (
                            <li
                                key={iso(entry.gregorian)}
                                className="ring-border/60 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 ring-1 ring-inset"
                            >
                                <span className="text-[0.8125rem] font-medium">
                                    {gregorian(entry.gregorian)}
                                </span>
                                <span className="text-muted-foreground text-[0.75rem]">
                                    {hijri(entry.hijri)}
                                    {" · "}
                                    {index === 0 && entry.daysAway === 0
                                        ? t("today")
                                        : t("inDays", { days: formatter.number(entry.daysAway) })}
                                </span>
                            </li>
                        ))}
                    </ol>
                    <div>
                        <Button variant="outline" size="sm" onClick={handleDownload}>
                            <IconCalendarPlus
                                className="size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("download")}
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
}
