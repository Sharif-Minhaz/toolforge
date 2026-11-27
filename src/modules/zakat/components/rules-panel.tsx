"use client";

import { useTranslations } from "next-intl";

import { OptionSelect } from "@/modules/tools/components/option-controls";
import {
    DEBT_RULES,
    JEWELLERY_RULES,
    KARAT_METHODS,
    MINOR_RULES,
    NISAB_BASES,
    NISAB_STANDARDS,
    YEAR_TYPES,
    type ZakatRules,
} from "../types";

type RulesPanelProps = {
    rules: ZakatRules;
    onChange: (patch: Partial<ZakatRules>) => void;
};

/**
 * Every opinion the figure depends on, one control each, with the reason for
 * each choice beside it. Changing any one turns the view to "custom" — the
 * presets are a starting point, not a cage.
 */
export function RulesPanel({ rules, onChange }: RulesPanelProps) {
    const t = useTranslations("zakat.rules");

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect
                label={t("nisabStandard.label")}
                hint={t(`nisabStandard.hints.${rules.nisabStandard}`)}
                value={rules.nisabStandard}
                values={NISAB_STANDARDS}
                items={Object.fromEntries(
                    NISAB_STANDARDS.map((value) => [value, t(`nisabStandard.options.${value}`)]),
                )}
                onChange={(nisabStandard) => onChange({ nisabStandard })}
            />
            <OptionSelect
                label={t("nisabBasis.label")}
                hint={t(`nisabBasis.hints.${rules.nisabBasis}`)}
                value={rules.nisabBasis}
                values={NISAB_BASES}
                items={Object.fromEntries(
                    NISAB_BASES.map((value) => [value, t(`nisabBasis.options.${value}`)]),
                )}
                onChange={(nisabBasis) => onChange({ nisabBasis })}
            />
            <OptionSelect
                label={t("karatMethod.label")}
                hint={t(`karatMethod.hints.${rules.karatMethod}`)}
                value={rules.karatMethod}
                values={KARAT_METHODS}
                items={Object.fromEntries(
                    KARAT_METHODS.map((value) => [value, t(`karatMethod.options.${value}`)]),
                )}
                onChange={(karatMethod) => onChange({ karatMethod })}
            />
            <OptionSelect
                label={t("jewellery.label")}
                hint={t(`jewellery.hints.${rules.jewellery}`)}
                value={rules.jewellery}
                values={JEWELLERY_RULES}
                items={Object.fromEntries(
                    JEWELLERY_RULES.map((value) => [value, t(`jewellery.options.${value}`)]),
                )}
                onChange={(jewellery) => onChange({ jewellery })}
            />
            <OptionSelect
                label={t("year.label")}
                hint={t(`year.hints.${rules.year}`)}
                value={rules.year}
                values={YEAR_TYPES}
                items={Object.fromEntries(
                    YEAR_TYPES.map((value) => [value, t(`year.options.${value}`)]),
                )}
                onChange={(year) => onChange({ year })}
            />
            <OptionSelect
                label={t("debts.label")}
                hint={t(`debts.hints.${rules.debts}`)}
                value={rules.debts}
                values={DEBT_RULES}
                items={Object.fromEntries(
                    DEBT_RULES.map((value) => [value, t(`debts.options.${value}`)]),
                )}
                onChange={(debts) => onChange({ debts })}
            />
            <OptionSelect
                label={t("minors.label")}
                hint={t(`minors.hints.${rules.minors}`)}
                value={rules.minors}
                values={MINOR_RULES}
                items={Object.fromEntries(
                    MINOR_RULES.map((value) => [value, t(`minors.options.${value}`)]),
                )}
                onChange={(minors) => onChange({ minors })}
            />
        </div>
    );
}
