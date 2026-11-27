"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { Karat } from "../types";

/**
 * How a purity reads: `22 karat` for gold, `917 fine` for silver, and
 * "Traditional" (সনাতনী) for the grade that has no number. One place, so the
 * row's select and the result's line say the same thing.
 */
export function usePurityLabel(): (metal: "gold" | "silver", karat: Karat) => string {
    const t = useTranslations("zakat.metals");
    const formatter = useFormatter();

    return (metal, karat) => {
        if (karat === "traditional") {
            return t("traditional");
        }

        return metal === "gold"
            ? t("karat", { karat: formatter.number(karat) })
            : t("fineness", { fineness: formatter.number(Math.round((karat / 24) * 1000)) });
    };
}
