import type { AttackModel, CrackTime, CrackTimeUnit } from "../types";
import { ATTACK_GUESSES_PER_SECOND } from "./constants";

/**
 * How long a brute-force search takes, given a named attacker.
 *
 * There is no such thing as *the* time to crack a password. The figure is a
 * function of three things, and this module is explicit about all three:
 *
 * 1. **The keyspace**, from `entropy.ts` — counted exactly, not estimated from
 *    the characters that came out.
 * 2. **The attacker's rate**, from `ATTACK_GUESSES_PER_SECOND` — a control the
 *    reader picks, not a hidden constant, because a rate-limited login form and
 *    a leaked MD5 table are ten orders of magnitude apart.
 * 3. **Half the keyspace, not all of it.** A search through a uniformly random
 *    secret finds it after half the candidates on average. Reporting the full
 *    keyspace doubles every number and is the more flattering error, so the
 *    average is what gets reported — and labelled as an average.
 *
 * The assumption underneath all of it: the attacker knows these settings and
 * brute-forces this keyspace. Not knowing them only makes their job harder, so
 * the estimate stays a lower bound on the work, which is the useful direction.
 */

const SECONDS_PER_MINUTE = 60;

const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** Julian year, so a "month" is a twelfth of the same year the label uses. */
const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;

const SECONDS_PER_MONTH = SECONDS_PER_YEAR / 12;

/** 13.8 billion years. Past this the figure has left anything a reader can hold. */
export const AGE_OF_UNIVERSE_YEARS = 1.38e10;

/**
 * Where a year count stops being information. Beyond this the UI says so in
 * words instead of printing a number with twenty digits behind it.
 */
const MAX_REPORTABLE_YEARS = 1e21;

/** Ladder walked from the top down, so the largest fitting unit wins. */
const LADDER: readonly { readonly unit: CrackTimeUnit; readonly seconds: number }[] = [
    { unit: "years", seconds: SECONDS_PER_YEAR },
    { unit: "months", seconds: SECONDS_PER_MONTH },
    { unit: "days", seconds: SECONDS_PER_DAY },
    { unit: "hours", seconds: SECONDS_PER_HOUR },
    { unit: "minutes", seconds: SECONDS_PER_MINUTE },
    { unit: "seconds", seconds: 1 },
];

/**
 * Above this many of a unit, compact notation stops being compact: English CLDR
 * runs out of names after "T", so 4.1 × 10²⁰ years renders as "410,000,000T" and
 * Bangla as an equally unreadable string of lakh-crores. The UI switches to
 * scientific notation from here up. Presentation reads it; the threshold lives
 * with the rest of the crack-time reasoning.
 */
export const COMPACT_NOTATION_CEILING = 1e15;

/**
 * Two significant figures, because the guess rates are rounded to a power of ten
 * and a result cannot be more precise than the model it came from. Printing
 * "2,417,338,201,455 years" from a rate of "about 10¹¹" would be theatre.
 *
 * `toPrecision` rather than divide-round-multiply: the latter leaves float dust
 * (3.9 arriving as 3.9000000000000004), which is not two significant figures by
 * any reading.
 */
export function roundToTwoSignificantDigits(value: number): number {
    if (value === 0 || !Number.isFinite(value)) {
        return 0;
    }

    return Number(value.toPrecision(2));
}

/** Average seconds to find a secret of `entropyBits` at the model's rate. */
export function averageGuessSeconds(entropyBits: number, model: AttackModel): number {
    return 2 ** (entropyBits - 1) / ATTACK_GUESSES_PER_SECOND[model];
}

export function estimateCrackTime(entropyBits: number, model: AttackModel): CrackTime {
    const seconds = averageGuessSeconds(entropyBits, model);

    if (seconds < 1) {
        return { kind: "instant" };
    }

    if (seconds / SECONDS_PER_YEAR > MAX_REPORTABLE_YEARS) {
        return { kind: "beyond" };
    }

    for (const step of LADDER) {
        if (seconds < step.seconds) {
            continue;
        }

        const value = roundToTwoSignificantDigits(seconds / step.seconds);

        return {
            kind: "duration",
            unit: step.unit,
            value,
            beyondUniverse: step.unit === "years" && value > AGE_OF_UNIVERSE_YEARS,
        };
    }

    // The ladder ends at one second and anything under that returned already.
    return { kind: "instant" };
}
