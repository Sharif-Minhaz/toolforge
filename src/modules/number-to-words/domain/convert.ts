import type {
    NumberWordsFailure,
    NumberWordsOptions,
    NumberWordsResult,
    ParsedNumber,
} from "../types";
import { banglaBelowHundred, banglaDigits, banglaInteger, BANGLA_WORDS } from "./bangla";
import {
    CURRENCY_FRACTION_DIGITS,
    CURRENCY_NAMES,
    MAX_FRACTION_DIGITS,
    MAX_INTEGER_DIGITS,
    MAX_NUMBER_INPUT_LENGTH,
} from "./constants";
import { englishDigits, englishInteger, ENGLISH_WORDS } from "./english";
import { applyLetterCase } from "./letter-case";
import { formatNumeral, isZero, toBanglaDigits } from "./numerals";
import { parseNumber } from "./parse";

type Lines = { readonly english: string; readonly bangla: string };

/**
 * The one entry point the page, the island and the MCP adapter all call: a
 * typed number, read out in English and in Bangla at once.
 *
 * Both lines are always produced. The reader of a Bangla cheque often needs
 * the English amount for the same cheque, and the reader of an English one
 * often needs to check it against the Bangla — so the tool never makes them
 * pick a language first.
 */
export function convertNumberToWords(
    input: string,
    options: NumberWordsOptions,
): NumberWordsResult {
    if (input.length > MAX_NUMBER_INPUT_LENGTH) {
        return { ok: false, reason: "too_many_digits" };
    }

    const parsed = parseNumber(input);

    if (!parsed.ok) {
        return parsed;
    }

    const value = parsed.value;
    const refusal = checkLimits(value, options);

    if (refusal !== null) {
        return refusal;
    }

    const lines =
        options.format === "currency"
            ? currencyLines(value, options)
            : cardinalLines(value, options);
    const fractionDigits =
        options.format === "currency" && value.fraction.length > 0
            ? CURRENCY_FRACTION_DIGITS
            : undefined;

    return {
        ok: true,
        english: applyLetterCase(lines.english, options.letterCase),
        bangla: lines.bangla,
        numeral: formatNumeral(value, options.scale, fractionDigits),
        banglaNumeral: toBanglaDigits(formatNumeral(value, "south-asian", fractionDigits)),
    };
}

function checkLimits(value: ParsedNumber, options: NumberWordsOptions): NumberWordsFailure | null {
    if (value.integer.length > MAX_INTEGER_DIGITS) {
        return { ok: false, reason: "too_many_digits" };
    }

    if (options.format === "currency") {
        // Refused rather than rounded: an amount with a third decimal is a
        // typing mistake, and a cheque that rounded it would be for a sum
        // nobody wrote down.
        if (value.fraction.length > CURRENCY_FRACTION_DIGITS) {
            return { ok: false, reason: "too_many_decimals" };
        }

        if (value.negative && !isZero(value)) {
            return { ok: false, reason: "negative_amount" };
        }

        return null;
    }

    if (value.fraction.length > MAX_FRACTION_DIGITS) {
        return { ok: false, reason: "too_many_decimals" };
    }

    return null;
}

function cardinalLines(value: ParsedNumber, options: NumberWordsOptions): Lines {
    let english = englishInteger(value.integer, options);
    let bangla = banglaInteger(value.integer);

    if (value.fraction.length > 0) {
        english = `${english} ${ENGLISH_WORDS.point} ${englishDigits(value.fraction)}`;
        bangla = `${bangla} ${BANGLA_WORDS.point} ${banglaDigits(value.fraction)}`;
    }

    // "minus zero" is not a number anybody says.
    if (value.negative && !isZero(value)) {
        english = `${ENGLISH_WORDS.minus} ${english}`;
        bangla = `${BANGLA_WORDS.minus} ${bangla}`;
    }

    return { english, bangla };
}

/**
 * An amount the way a cheque writes it: the major unit, then the minor unit if
 * there is one, then "only". `.5` is fifty paisa, not five — the fraction is
 * read as hundredths, which is the whole difference from a cardinal.
 */
function currencyLines(value: ParsedNumber, options: NumberWordsOptions): Lines {
    const names = CURRENCY_NAMES[options.currency];
    const major = BigInt(value.integer);
    const minor = Number(value.fraction.padEnd(CURRENCY_FRACTION_DIGITS, "0") || "0");

    const englishParts: string[] = [];
    const banglaParts: string[] = [];

    // A bare fifty paisa is written as just that; "zero taka and fifty paisa"
    // is not how anybody fills in a cheque.
    if (major > 0n || minor === 0) {
        englishParts.push(
            `${englishInteger(value.integer, options)} ${major === 1n ? names.en.major : names.en.majorPlural}`,
        );
        banglaParts.push(`${banglaInteger(value.integer)} ${names.bn.major}`);
    }

    if (minor > 0) {
        const englishMinor = `${englishInteger(String(minor), options)} ${minor === 1 ? names.en.minor : names.en.minorPlural}`;

        englishParts.push(
            englishParts.length > 0 ? `${ENGLISH_WORDS.and} ${englishMinor}` : englishMinor,
        );
        banglaParts.push(`${banglaBelowHundred(minor)} ${names.bn.minor}`);
    }

    if (options.appendOnly) {
        englishParts.push(ENGLISH_WORDS.only);
        banglaParts.push(BANGLA_WORDS.only);
    }

    return { english: englishParts.join(" "), bangla: banglaParts.join(" ") };
}
