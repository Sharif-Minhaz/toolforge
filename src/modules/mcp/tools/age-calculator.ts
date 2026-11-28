import { z } from "zod";

import { formatBanglaDate } from "@/modules/age-calculator/domain/bangla-names";
import { calculateAge, convertDate } from "@/modules/age-calculator/domain/calculate";
import { DEFAULT_HIJRI_ADJUSTMENT } from "@/modules/age-calculator/domain/constants";
import { formatIsoDate } from "@/modules/age-calculator/domain/gregorian";
import { todayInBangladesh } from "@/modules/age-calculator/domain/today";
import {
    BANGLA_MONTHS,
    HIJRI_MONTHS,
    WEEKDAYS,
    type DateFacts,
    type LimitCheck,
} from "@/modules/age-calculator/types";
import {
    calendarSchema,
    dateInputSchema,
    hijriAdjustmentSchema,
    limitYearsSchema,
} from "@/modules/age-calculator/validation/age-options";
import type { JsonValue } from "@/modules/tools/types/json-document";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * One day as data. Month names travel as the catalogue's keys (`falgun`,
 * `ramadan`) beside the numbers: the readable names live in the message
 * catalogue, and a second English spelling here would drift from it.
 */
function factsAsJson(facts: DateFacts): JsonValue {
    return {
        gregorian: facts.iso,
        weekday: WEEKDAYS[facts.weekday],
        bangla: {
            year: facts.bangla.year,
            month: facts.bangla.month,
            monthName: BANGLA_MONTHS[facts.bangla.month - 1],
            day: facts.bangla.day,
            rule: facts.bangla.rule,
            beforeReform: facts.bangla.beforeReform,
            text: formatBanglaDate(facts.bangla),
        },
        hijri: {
            year: facts.hijri.year,
            month: facts.hijri.month,
            monthName: HIJRI_MONTHS[facts.hijri.month - 1],
            day: facts.hijri.day,
        },
    };
}

function describeFacts(facts: DateFacts): string {
    const { bangla, hijri } = facts;

    return `${facts.iso} (${WEEKDAYS[facts.weekday]}) = ${formatBanglaDate(bangla)} = ${hijri.day} ${HIJRI_MONTHS[hijri.month - 1]} ${hijri.year} AH`;
}

function checkAsJson(check: LimitCheck | null): JsonValue {
    return check === null
        ? null
        : { years: check.years, passes: check.passes, edgeBirthDate: formatIsoDate(check.born) };
}

const DATE_DESCRIPTION =
    "Day first as Bangladesh writes it (`12/05/1998`, `12-05-1998`) or ISO `1998-05-12`; Bangla digits are accepted";

export const ageCalculatorCalculateTool = defineMcpTool({
    toolId: "age-calculator",
    verb: "calculate",
    title: "Age on a date, against a job circular's age limit",
    description:
        "Work out an age in completed years, months and days on a cut-off date — the figure Bangladeshi job circulars ask for — and optionally check it against a minimum and maximum age. A maximum of 30 passes up to and including the 30th birthday. A relaxation date (the 2020 COVID-19 notices used `25/03/2020`) is a second date on which the maximum alone may be met. Each check returns the date of birth on its edge. Month-end and 29 February births follow `java.time.Period`: 29 Feb 2000 → 28 Feb 2001 is 11 months 30 days. Every date is also returned in Bangladesh's Bangla calendar (বঙ্গাব্দ) under the revision in force on it — 2019 from 1426 BS, 1987 before — and in the tabular Hijri calendar. When `reference` is omitted it is today in Bangladesh (Asia/Dhaka). `body` re-reads the days lived as published adult daily averages — heartbeats (100,000/day) and blood pumped (5.7 L/min, Cleveland Clinic), breaths (23,000/day, American Lung Association), oxygen used and CO2 breathed out (0.72 and 0.91 kg/day without exercise, NASA Human Integration Design Handbook), hairs shed (50–100/day, a range, American Academy of Dermatology), one scalp hair's growth (0.35 mm/day) and one fingernail's (3.47 mm per 30 days, Yaemsiri 2010). These are estimates, not measurements.",
    kind: "offline",
    inputSchema: z.object({
        birth: dateInputSchema.describe(`Date of birth. ${DATE_DESCRIPTION}`),
        reference: dateInputSchema
            .default("")
            .describe(
                `The cut-off date the age is counted on; empty for today in Bangladesh. ${DATE_DESCRIPTION}`,
            ),
        minYears: limitYearsSchema
            .nullable()
            .default(null)
            .describe("Minimum age in whole years, or null to skip"),
        maxYears: limitYearsSchema
            .nullable()
            .default(null)
            .describe("Maximum age in whole years, or null to skip"),
        relaxation: dateInputSchema
            .default("")
            .describe(
                "Optional second date on which the maximum may be met instead, e.g. `25/03/2020`; empty for none",
            ),
        hijriAdjustment: hijriAdjustmentSchema
            .default(DEFAULT_HIJRI_ADJUSTMENT)
            .describe("Days to shift the Hijri dates to match a local moon sighting, -2 to 2"),
    }),
    run: ({ birth, reference, minYears, maxYears, relaxation, hijriAdjustment }) => {
        const result = calculateAge({
            birth,
            // The clock is read here, at the edge, never inside the domain.
            reference:
                reference.trim().length > 0
                    ? reference
                    : formatIsoDate(todayInBangladesh(Date.now())),
            limits: { minYears, maxYears },
            relaxation,
            hijriAdjustment,
        });

        if (!result.ok) {
            return refuseWithReason("Age calculator", result.reason, {
                dateReason: result.dateReason ?? null,
            });
        }

        const { age, eligibility } = result;
        const verdict =
            eligibility === null
                ? ""
                : eligibility.eligible
                  ? eligibility.passedByRelaxation
                      ? " — eligible through the relaxation date"
                      : " — within the age limit"
                  : " — outside the age limit";

        return succeed(
            `${age.years} years ${age.months} months ${age.days} days on ${result.reference.iso}${verdict}.\nBorn ${describeFacts(result.birth)}.`,
            {
                age: { years: age.years, months: age.months, days: age.days },
                totals: {
                    months: result.totals.months,
                    weeks: result.totals.weeks,
                    days: result.totals.days,
                },
                body: {
                    days: result.body.days,
                    heartbeats: result.body.heartbeats,
                    bloodLitres: result.body.bloodLitres,
                    breaths: result.body.breaths,
                    oxygenKg: result.body.oxygenKg,
                    carbonDioxideKg: result.body.carbonDioxideKg,
                    hairsShed: { low: result.body.hairsShed.low, high: result.body.hairsShed.high },
                    hairGrownMm: result.body.hairGrownMm,
                    nailGrownMm: result.body.nailGrownMm,
                },
                nextBirthday: {
                    date: formatIsoDate(result.nextBirthday.date),
                    daysUntil: result.nextBirthday.daysUntil,
                    turning: result.nextBirthday.turning,
                },
                birth: factsAsJson(result.birth),
                reference: factsAsJson(result.reference),
                relaxation: result.relaxation === null ? null : factsAsJson(result.relaxation),
                eligibility:
                    eligibility === null
                        ? null
                        : {
                              eligible: eligibility.eligible,
                              passedByRelaxation: eligibility.passedByRelaxation,
                              min: checkAsJson(eligibility.min),
                              max: checkAsJson(eligibility.max),
                              relaxedMax: checkAsJson(eligibility.relaxedMax),
                          },
            },
        );
    },
});

export const ageCalculatorConvertTool = defineMcpTool({
    toolId: "age-calculator",
    verb: "convert",
    title: "Convert a date between English, Bangla (বঙ্গাব্দ) and Hijri",
    description:
        "Convert one day between the Gregorian calendar, Bangladesh's Bangla calendar (বঙ্গাব্দ) and the tabular Hijri calendar. Bangla dates follow the revision in force on that day: Bangla Academy's 2019 rule from 1426 BS (Boishakh–Ashwin 31 days, Falgun 29 or 30 in a leap year, the rest 30 — 21 February is 8 Falgun, 16 December is 1 Poush) and the 1987 rule from 1394 to 1425 BS (Boishakh–Bhadro 31, Falgun 30 or 31); earlier dates apply the 1987 rule backwards and are flagged `beforeReform`. 1 Boishakh is always 14 April. This is not West Bengal's astronomical calendar. Months are numbered 1–12 from Boishakh and from Muharram. Hijri dates are arithmetic; Bangladesh's moon-sighted date can differ by a day or two, which `hijriAdjustment` shifts. Years 1900–2100 (Gregorian).",
    kind: "offline",
    inputSchema: z.object({
        calendar: calendarSchema.describe("The calendar the date is given in"),
        year: z.number().int().describe("Year in that calendar — e.g. 2026, 1433 BS, 1448 AH"),
        month: z.number().int().min(1).max(12).describe("Month number, 1–12"),
        day: z.number().int().min(1).max(31).describe("Day of the month"),
        hijriAdjustment: hijriAdjustmentSchema
            .default(DEFAULT_HIJRI_ADJUSTMENT)
            .describe("Days to shift the Hijri calendar to match a local moon sighting, -2 to 2"),
    }),
    run: ({ calendar, year, month, day, hijriAdjustment }) => {
        const result = convertDate({ calendar, year, month, day }, hijriAdjustment);

        if (!result.ok) {
            return refuseWithReason("Date converter", result.reason);
        }

        return succeed(describeFacts(result.facts), factsAsJson(result.facts));
    },
});
