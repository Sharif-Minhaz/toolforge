import type { ZakatRules, ZakatView } from "../types";

/**
 * The two named sets of opinions, and how to tell which one a set of rules is.
 *
 * **Hanafi** is the default because Bangladesh, Pakistan, India and Turkey
 * follow it: the 7.5 / 52.5 tola nisab; gold alone weighed against gold, gold
 * mixed with anything valued against silver (Fatawa Darul Uloom Deoband
 * 6/123); jewellery zakatable whether worn or not; an alloy that is mostly
 * gold counted at full weight (Ibn 'Abidin); debts cut to what falls due in a
 * year; a minor's wealth exempt.
 *
 * **Majority** is the Maliki, Shafi'i and Hanbali position as the large
 * Arabic-language bodies give it: Qaradawi's 85 g / 595 g; the silver nisab for
 * money, as the more beneficial to the poor (Muslim World League Fiqh Council,
 * Saudi Council of Senior Scholars); worn jewellery exempt; only the pure
 * metal in an alloy counted (al-Nawawi, Ibn Qudamah); only debts due now
 * deducted (Ibn Baz, Ibn 'Uthaymeen); a minor's wealth zakatable, paid by the
 * guardian.
 *
 * Neither is a ruling. The page says so above the controls, and every rule can
 * be changed one at a time — at which point the view reads as `custom`.
 */

export const VIEW_RULES: Readonly<Record<Exclude<ZakatView, "custom">, ZakatRules>> = {
    hanafi: {
        nisabStandard: "tola",
        nisabBasis: "auto",
        karatMethod: "majority",
        jewellery: "zakatable",
        year: "lunar",
        debts: "year",
        minors: "exempt",
    },
    majority: {
        nisabStandard: "grams",
        nisabBasis: "silver",
        karatMethod: "pure",
        jewellery: "exempt",
        year: "lunar",
        debts: "due",
        minors: "zakatable",
    },
};

export const DEFAULT_VIEW = "hanafi";

export const DEFAULT_RULES: ZakatRules = VIEW_RULES[DEFAULT_VIEW];

const RULE_KEYS = [
    "nisabStandard",
    "nisabBasis",
    "karatMethod",
    "jewellery",
    "year",
    "debts",
    "minors",
] as const satisfies readonly (keyof ZakatRules)[];

export function sameRules(a: ZakatRules, b: ZakatRules): boolean {
    return RULE_KEYS.every((key) => a[key] === b[key]);
}

/** The named view these rules match, or `custom` once any one differs. */
export function viewOf(rules: ZakatRules): ZakatView {
    if (sameRules(rules, VIEW_RULES.hanafi)) {
        return "hanafi";
    }

    return sameRules(rules, VIEW_RULES.majority) ? "majority" : "custom";
}
