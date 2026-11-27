import type {
    AgeLimits,
    CivilDate,
    Eligibility,
    EligibilityFailureReason,
    LimitCheck,
} from "../types";
import { addDays, addYears, computeAge } from "./age";
import { MAX_LIMIT_YEARS } from "./constants";
import { compareDates, parseWholeNumber } from "./gregorian";

/**
 * A job circular's age limit, read the way Bangladesh's notices read it.
 *
 * "Between 18 and 30 on the cut-off date" means at least 18 years 0 months
 * 0 days, and at most 30 years 0 months 0 days: on the thirtieth birthday the
 * reader is still eligible, and the day after they are not. A relaxation date
 * — the COVID-19 notices' 25 March 2020 — is a second chance at the maximum
 * only; the minimum is still counted on the circular's own date.
 *
 * Every check also names the date of birth on its edge, which is the figure a
 * reader can hold their own certificate against.
 */

/** Age can only fall as the birth date moves later, so a few steps always find the edge. */
const EDGE_SEARCH_DAYS = 4;

function isOldEnough(birth: CivilDate, cutoff: CivilDate, years: number): boolean {
    return compareDates(birth, cutoff) <= 0 && computeAge(birth, cutoff).years >= years;
}

/**
 * At most `years` 0 months 0 days — read as "still under `years` the day
 * before", which is the same thing for every birthday but one. Somebody born
 * on 29 February is never exactly 30 years 0 months 0 days in a common year:
 * the figure goes from 29y 11m 30d on 28 February to 30y 0m 1d on 1 March. That
 * 1 March is their thirtieth birthday all the same, and it stays eligible.
 */
function isYoungEnough(birth: CivilDate, cutoff: CivilDate, years: number): boolean {
    const dayBefore = addDays(cutoff, -1);

    // Not yet born the day before the cut-off is young enough by any measure.
    return compareDates(birth, dayBefore) > 0 || computeAge(birth, dayBefore).years < years;
}

/** The latest date of birth that is at least `years` old on `cutoff`. */
export function latestBirthOldEnough(cutoff: CivilDate, years: number): CivilDate {
    let candidate = addDays(addYears(cutoff, -years), EDGE_SEARCH_DAYS);

    while (!isOldEnough(candidate, cutoff, years)) {
        candidate = addDays(candidate, -1);
    }

    return candidate;
}

/** The earliest date of birth that is no more than `years` 0 months 0 days old on `cutoff`. */
export function earliestBirthYoungEnough(cutoff: CivilDate, years: number): CivilDate {
    let candidate = addDays(addYears(cutoff, -years), -EDGE_SEARCH_DAYS);

    while (!isYoungEnough(candidate, cutoff, years)) {
        candidate = addDays(candidate, 1);
    }

    return candidate;
}

function isLimitInRange(years: number | null): boolean {
    return years === null || (Number.isInteger(years) && years >= 0 && years <= MAX_LIMIT_YEARS);
}

export function validateLimits(limits: AgeLimits): EligibilityFailureReason | null {
    if (!isLimitInRange(limits.minYears) || !isLimitInRange(limits.maxYears)) {
        return "limit_out_of_range";
    }

    if (limits.minYears !== null && limits.maxYears !== null && limits.minYears > limits.maxYears) {
        return "min_above_max";
    }

    return null;
}

export function hasLimits(limits: AgeLimits): boolean {
    return limits.minYears !== null || limits.maxYears !== null;
}

function checkMax(birth: CivilDate, cutoff: CivilDate, years: number): LimitCheck {
    return {
        years,
        passes: isYoungEnough(birth, cutoff, years),
        born: earliestBirthYoungEnough(cutoff, years),
    };
}

/** Limits must already have passed {@link validateLimits}. */
export function checkEligibility(
    birth: CivilDate,
    cutoff: CivilDate,
    limits: AgeLimits,
    relaxation: CivilDate | null,
): Eligibility {
    const min: LimitCheck | null =
        limits.minYears === null
            ? null
            : {
                  years: limits.minYears,
                  passes: isOldEnough(birth, cutoff, limits.minYears),
                  born: latestBirthOldEnough(cutoff, limits.minYears),
              };
    const max = limits.maxYears === null ? null : checkMax(birth, cutoff, limits.maxYears);
    const relaxedMax =
        limits.maxYears === null || relaxation === null
            ? null
            : checkMax(birth, relaxation, limits.maxYears);

    const minPasses = min === null || min.passes;
    const maxPasses = max === null || max.passes;
    const relaxedPasses = relaxedMax !== null && relaxedMax.passes;

    return {
        eligible: minPasses && (maxPasses || relaxedPasses),
        min,
        max,
        relaxedMax,
        passedByRelaxation: minPasses && !maxPasses && relaxedPasses,
    };
}

export type LimitInput =
    { readonly ok: true; readonly years: number | null } | { readonly ok: false };

/** A typed limit: blank is no limit, whole years in either script are a limit, anything else is refused. */
export function parseLimitInput(text: string): LimitInput {
    const years = parseWholeNumber(text);

    if (years === null) {
        return { ok: true, years: null };
    }

    return Number.isNaN(years) || years > MAX_LIMIT_YEARS ? { ok: false } : { ok: true, years };
}
