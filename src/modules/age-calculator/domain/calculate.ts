import { getWeekday } from "@/modules/tools/domain/calendar";
import type {
    AgeRequest,
    AgeResult,
    CalendarFields,
    CalendarId,
    CivilDate,
    ConvertResult,
    DateFacts,
    DateInputResult,
} from "../types";
import { computeAge, computeTotals, nextBirthday } from "./age";
import { fromBanglaDate, toBanglaDate } from "./bangla-calendar";
import { lifetimeBodyStats } from "./body-stats";
import { MAX_HIJRI_ADJUSTMENT } from "./constants";
import { checkEligibility, hasLimits, validateLimits } from "./eligibility";
import {
    compareDates,
    formatIsoDate,
    isInSupportedRange,
    isValidCivilDate,
    parseDateInput,
} from "./gregorian";
import { fromHijriDate, toHijriDate } from "@/modules/tools/domain/hijri";

/**
 * The two operations the page, the island and the MCP adapter all call. Pure:
 * "today" is never read here. The page reads the clock once on the server and
 * hands the date in as text, like any other date.
 */

function clampAdjustment(adjustment: number): number {
    if (!Number.isInteger(adjustment)) {
        return 0;
    }

    return Math.max(-MAX_HIJRI_ADJUSTMENT, Math.min(MAX_HIJRI_ADJUSTMENT, adjustment));
}

export function describeDate(date: CivilDate, hijriAdjustment = 0): DateFacts {
    return {
        gregorian: date,
        iso: formatIsoDate(date),
        weekday: getWeekday(date.year, date.month, date.day),
        bangla: toBanglaDate(date),
        hijri: toHijriDate(date, clampAdjustment(hijriAdjustment)),
    };
}

export function calculateAge(request: AgeRequest): AgeResult {
    const birth = parseDateInput(request.birth);

    if (!birth.ok) {
        return { ok: false, reason: "invalid_birth", dateReason: birth.reason };
    }

    const reference = parseDateInput(request.reference);

    if (!reference.ok) {
        return { ok: false, reason: "invalid_reference", dateReason: reference.reason };
    }

    // Blank means no relaxation; anything typed has to be a date.
    const relaxation: DateInputResult | null =
        request.relaxation.trim().length === 0 ? null : parseDateInput(request.relaxation);

    if (relaxation !== null && !relaxation.ok) {
        return { ok: false, reason: "invalid_relaxation", dateReason: relaxation.reason };
    }

    if (compareDates(birth.date, reference.date) > 0) {
        return { ok: false, reason: "birth_after_reference" };
    }

    const limitFailure = validateLimits(request.limits);

    if (limitFailure !== null) {
        return { ok: false, reason: limitFailure };
    }

    const relaxationDate = relaxation === null ? null : relaxation.date;
    const adjustment = request.hijriAdjustment;
    const totals = computeTotals(birth.date, reference.date);

    return {
        ok: true,
        age: computeAge(birth.date, reference.date),
        totals,
        body: lifetimeBodyStats(totals.days),
        birth: describeDate(birth.date, adjustment),
        reference: describeDate(reference.date, adjustment),
        nextBirthday: nextBirthday(birth.date, reference.date),
        eligibility: hasLimits(request.limits)
            ? checkEligibility(birth.date, reference.date, request.limits, relaxationDate)
            : null,
        relaxation: relaxationDate === null ? null : describeDate(relaxationDate, adjustment),
    };
}

function toGregorian(fields: CalendarFields, adjustment: number): CivilDate | null {
    switch (fields.calendar) {
        case "gregorian": {
            const date = { year: fields.year, month: fields.month, day: fields.day };

            return isValidCivilDate(date) ? date : null;
        }
        case "bangla":
            return fromBanglaDate(fields.year, fields.month, fields.day);
        case "hijri":
            return fromHijriDate(fields.year, fields.month, fields.day, adjustment);
    }
}

/** One date, entered in any of the three calendars, named in all three. */
export function convertDate(fields: CalendarFields, hijriAdjustment = 0): ConvertResult {
    const adjustment = clampAdjustment(hijriAdjustment);
    const date = toGregorian(fields, adjustment);

    if (date === null) {
        return { ok: false, reason: "invalid_date" };
    }

    if (!isInSupportedRange(date)) {
        return { ok: false, reason: "out_of_range" };
    }

    return { ok: true, facts: describeDate(date, adjustment) };
}

/**
 * The same day's fields in another calendar, so switching the convert side's
 * calendar re-expresses the date on screen instead of throwing it away.
 */
export function expressIn(facts: DateFacts, calendar: CalendarId): CalendarFields {
    const date =
        calendar === "gregorian"
            ? facts.gregorian
            : calendar === "bangla"
              ? facts.bangla
              : facts.hijri;

    return { calendar, year: date.year, month: date.month, day: date.day };
}
