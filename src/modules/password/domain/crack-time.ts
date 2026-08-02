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

/**
 * How many times the age of the universe a year count comes to, or `null` while
 * it still fits inside one. "Longer than the universe has existed" is true of
 * almost every strong password and therefore says almost nothing; the multiple
 * is the part that distinguishes them.
 */
function universeMultiple(unit: CrackTimeUnit, value: number): number | null {
    if (unit !== "years" || value <= AGE_OF_UNIVERSE_YEARS) {
        return null;
    }

    return roundToTwoSignificantDigits(value / AGE_OF_UNIVERSE_YEARS);
}

export function estimateCrackTime(entropyBits: number, model: AttackModel): CrackTime {
    const seconds = averageGuessSeconds(entropyBits, model);

    // Past ~1024 bits the keyspace overflows a double. Nothing this generator
    // can produce reaches it, but an estimate is not the place to print `NaN`.
    if (!Number.isFinite(seconds)) {
        return { kind: "beyond" };
    }

    if (seconds < 1) {
        return { kind: "instant" };
    }

    for (const [index, step] of LADDER.entries()) {
        if (seconds < step.seconds) {
            continue;
        }

        const rounded = roundToTwoSignificantDigits(seconds / step.seconds);

        // Rounding can carry into the unit above: 59.8 seconds becomes "60
        // seconds", which is a minute, and 11.99 months becomes "12 months",
        // which is a year. Promote instead of printing the carried figure. One
        // level is enough — a carry cannot cross two rungs.
        const larger = LADDER[index - 1];
        const promote = larger !== undefined && rounded * step.seconds >= larger.seconds;
        const unit = promote ? larger.unit : step.unit;
        const value = promote
            ? roundToTwoSignificantDigits((rounded * step.seconds) / larger.seconds)
            : rounded;

        return {
            kind: "duration",
            unit,
            value,
            universeMultiple: universeMultiple(unit, value),
        };
    }

    // The ladder ends at one second and anything under that returned already.
    return { kind: "instant" };
}
