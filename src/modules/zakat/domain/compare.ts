import type { PriceSnapshot, ZakatInput, ZakatRules, ZakatVerdict } from "../types";
import { calculateZakat } from "./calculate";
import { sameRules, VIEW_RULES } from "./rules";

/**
 * The same holdings under the other common opinions, so a reader can see how
 * much rests on which scholar they follow — the question every one of these
 * calculators leaves to a separate search.
 *
 * Four alternatives, each one change a reader is likely to ask about. A
 * variant whose rules come out identical to the reader's own is left out, so
 * the table never repeats the figure above it.
 */
export const COMPARISON_VARIANTS = [
    "hanafi",
    "majority",
    "goldNisab",
    "silverNisab",
    "solarYear",
] as const;

export type ComparisonVariant = (typeof COMPARISON_VARIANTS)[number];

export type Comparison = {
    readonly variant: ComparisonVariant;
    readonly verdict: ZakatVerdict;
    readonly payable: string;
};

function rulesFor(variant: ComparisonVariant, own: ZakatRules): ZakatRules {
    switch (variant) {
        case "hanafi":
            return VIEW_RULES.hanafi;
        case "majority":
            return VIEW_RULES.majority;
        case "goldNisab":
            return { ...own, nisabBasis: "gold" };
        case "silverNisab":
            return { ...own, nisabBasis: "silver" };
        case "solarYear":
            return { ...own, year: own.year === "solar" ? "lunar" : "solar" };
    }
}

export function compareViews(input: ZakatInput, snapshot: PriceSnapshot): Comparison[] {
    const seen: ZakatRules[] = [input.rules];
    const rows: Comparison[] = [];

    for (const variant of COMPARISON_VARIANTS) {
        const rules = rulesFor(variant, input.rules);

        if (seen.some((other) => sameRules(other, rules))) {
            continue;
        }

        seen.push(rules);

        const outcome = calculateZakat({ ...input, rules }, snapshot);

        if (outcome.ok) {
            rows.push({ variant, verdict: outcome.verdict, payable: outcome.payable });
        }
    }

    return rows;
}
