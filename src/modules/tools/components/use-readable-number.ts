"use client";

import { useFormatter, useTranslations } from "next-intl";

import { describeMagnitude, superscript } from "../domain/magnitude";

/**
 * A number written the way a person would say it: "410 quintillion", not
 * "4.1E20" and not "410,000,000T". The digits go through `Intl`, so Bangla gets
 * Bengali numerals, and the magnitude comes from a translated name rather than
 * from CLDR's compact table, which stops having names long before these figures
 * stop appearing.
 *
 * Returned as a function rather than a component because the result has to be an
 * ICU argument — "{value} years" is one message, and a `ReactNode` cannot be
 * passed into it.
 */
export function useReadableNumber(): (value: number) => string {
    const t = useTranslations("common.magnitude");
    const formatter = useFormatter();

    return (value) => {
        const magnitude = describeMagnitude(value);
        const digits = formatter.number(magnitude.value, { maximumFractionDigits: 1 });

        if (magnitude.kind === "plain") {
            return digits;
        }

        if (magnitude.kind === "scaled") {
            return t(magnitude.scale, { value: digits });
        }

        return t("power", { value: digits, exponent: superscript(magnitude.exponent) });
    };
}
