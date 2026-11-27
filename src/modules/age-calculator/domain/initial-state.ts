import type { AgeSearchParams } from "../validation/age-options";
import type { CivilDate, ConvertFields, InitialWorkbenchState } from "../types";
import { describeDate, expressIn } from "./calculate";
import { DEFAULT_CONVERT_CALENDAR, DEFAULT_HIJRI_ADJUSTMENT, DEFAULT_MODE } from "./constants";
import { formatDayFirst } from "./gregorian";

/**
 * The island's first state, from a shared link and today's date. The cut-off
 * date opens on today, so the page answers "how old am I" before anything is
 * typed; the convert side opens on today in whichever calendar the link names.
 */
export function buildInitialState(
    params: AgeSearchParams,
    today: CivilDate,
): InitialWorkbenchState {
    const hijriAdjustment = params.hadj ?? DEFAULT_HIJRI_ADJUSTMENT;
    const calendar = params.cal ?? DEFAULT_CONVERT_CALENDAR;

    return {
        mode: params.mode ?? DEFAULT_MODE,
        ageFields: {
            birth: params.dob ?? "",
            reference: params.on ?? formatDayFirst(today),
            min: params.min === undefined ? "" : String(params.min),
            max: params.max === undefined ? "" : String(params.max),
            relaxation: params.alt ?? "",
        },
        convertFields: convertFieldsFrom(params.date, calendar, today, hijriAdjustment),
        hijriAdjustment,
    };
}

function convertFieldsFrom(
    date: string | undefined,
    calendar: ConvertFields["calendar"],
    today: CivilDate,
    hijriAdjustment: number,
): ConvertFields {
    if (date !== undefined) {
        // The schema has already held it to `day-month-year` digits.
        const [day, month, year] = date.split("-");
        const monthNumber = Number(month);

        if (monthNumber >= 1 && monthNumber <= 12) {
            return { calendar, day, month: monthNumber, year };
        }
    }

    const expressed = expressIn(describeDate(today, hijriAdjustment), calendar);

    return {
        calendar,
        day: String(expressed.day),
        month: expressed.month,
        year: String(expressed.year),
    };
}
