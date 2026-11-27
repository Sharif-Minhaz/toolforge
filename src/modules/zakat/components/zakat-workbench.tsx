"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import {
    OptionsDisclosure,
    RESULT_TRAY,
    StepLabel,
} from "@/modules/tools/components/workbench-step";
import type { CivilDate } from "@/modules/tools/types";
import { calculateZakat, isDeductible } from "../domain/calculate";
import { compareViews } from "../domain/compare";
import {
    createForm,
    isBlank,
    isPriceBasisAvailable,
    toZakatInput,
    type MoneyField,
    type MoneySection,
    type ZakatForm,
} from "../domain/form";
import { VIEW_RULES, viewOf } from "../domain/rules";
import {
    CURRENCY_CODES,
    LIABILITY_KINDS,
    PRICE_BASES,
    SHARE_METHODS,
    ZAKAT_VIEWS,
    type CurrencyCode,
    type LiabilityKind,
    type MoneyKind,
    type PriceBasis,
    type PriceSnapshot,
    type ZakatRules,
} from "../types";
import { AmountInput } from "./amount-input";
import { CryptoList } from "./crypto-list";
import { CodeSelect } from "./currency-select";
import { HawlPanel } from "./hawl-panel";
import { MetalList } from "./metal-list";
import { MoneySectionFields } from "./money-section";
import { NisabCard } from "./nisab-card";
import { PricePanel } from "./price-panel";
import { ResultPanel } from "./result-panel";
import { RulesPanel } from "./rules-panel";

const LIABILITIES: ReadonlySet<string> = new Set(LIABILITY_KINDS);

function isLiabilityKind(kind: MoneyKind): kind is LiabilityKind {
    return LIABILITIES.has(kind);
}

type ZakatWorkbenchProps = {
    /** Read on the server for this request; see `repository/prices.ts`. */
    snapshot: PriceSnapshot;
    today: CivilDate;
    initialCurrency: CurrencyCode;
    initialRules: ZakatRules;
    initialPriceBasis: PriceBasis | null;
};

export function ZakatWorkbench({
    snapshot,
    today,
    initialCurrency,
    initialRules,
    initialPriceBasis,
}: ZakatWorkbenchProps) {
    const t = useTranslations("zakat.workbench");
    const tSections = useTranslations("zakat.sections");
    const tBases = useTranslations("zakat.priceBases");
    const tViews = useTranslations("zakat.views");
    const tErrors = useTranslations("zakat.errors");
    const tShares = useTranslations("zakat.shares");
    const tFields = useTranslations("zakat.fields");
    const sharesId = useId();
    const ratioId = useId();

    const [form, setForm] = useState<ZakatForm>(() =>
        createForm(snapshot, initialCurrency, initialRules, initialPriceBasis ?? undefined),
    );
    const idCounter = useRef(0);

    // Typed amounts settle for 300 ms before the figure is recomputed; a choice
    // from a select lands with the next keystroke-free tick all the same.
    const settled = useDebouncedValue(form);
    const stale = settled !== form;
    const input = toZakatInput(settled);
    const outcome = calculateZakat(input, snapshot);
    const comparisons = outcome.ok ? compareViews(input, snapshot) : [];
    const view = viewOf(form.rules);

    const patch = (next: Partial<ZakatForm>) => setForm((current) => ({ ...current, ...next }));
    const patchRules = (next: Partial<ZakatRules>) =>
        setForm((current) => ({ ...current, rules: { ...current.rules, ...next } }));
    const setMoney = (kind: MoneyKind, field: MoneyField) =>
        setForm((current) => ({ ...current, money: { ...current.money, [kind]: field } }));
    const newId = () => {
        idCounter.current += 1;

        return `row-${idCounter.current}`;
    };

    // A complaint about one field belongs beside that field.
    const failedLine = outcome.ok ? undefined : outcome.lineId;
    const errorFor = (id: string): string | null =>
        !outcome.ok && failedLine === id
            ? tErrors(outcome.reason, { code: outcome.code ?? "" })
            : null;
    const noteFor = (kind: MoneyKind): string | null =>
        isLiabilityKind(kind) && !isDeductible(kind, form.rules) ? tFields("notDeducted") : null;

    const unavailable = PRICE_BASES.filter((basis) => !isPriceBasisAvailable(basis, snapshot));

    function changeCurrency(currency: CurrencyCode) {
        setForm((current) => {
            // Fields still in the old report currency follow it; a field the
            // reader set to another currency keeps that currency.
            const money = Object.fromEntries(
                Object.entries(current.money).map(([kind, field]) => [
                    kind,
                    field.currency === current.currency ? { ...field, currency } : field,
                ]),
            );
            const shares =
                current.longTermShares.currency === current.currency
                    ? { ...current.longTermShares, currency }
                    : current.longTermShares;

            return { ...current, currency, money, longTermShares: shares };
        });
    }

    const sectionFields = (section: MoneySection, children?: ReactNode) => (
        <MoneySectionFields
            section={section}
            form={form}
            onChange={setMoney}
            errorFor={errorFor}
            noteFor={noteFor}
        >
            {children}
        </MoneySectionFields>
    );

    return (
        <Card className="gap-0 overflow-hidden p-0">
            {/* Core choices: what the figure is in, whose opinions, whose prices. */}
            <div className="border-border/70 flex flex-col gap-4 border-b p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                    <OptionSelect
                        label={t("currency")}
                        value={form.currency}
                        values={CURRENCY_CODES}
                        items={Object.fromEntries(CURRENCY_CODES.map((code) => [code, code]))}
                        onChange={changeCurrency}
                    />
                    <OptionSelect
                        label={t("view")}
                        hint={tViews(`hints.${view}`)}
                        value={view}
                        values={ZAKAT_VIEWS}
                        disabledValues={view === "custom" ? [] : ["custom"]}
                        items={Object.fromEntries(
                            ZAKAT_VIEWS.map((value) => [value, tViews(value)]),
                        )}
                        onChange={(next) => {
                            if (next !== "custom") {
                                patch({ rules: VIEW_RULES[next] });
                            }
                        }}
                    />
                    <OptionSelect
                        label={t("priceBasis")}
                        hint={tBases(`hints.${form.priceBasis}`)}
                        value={form.priceBasis}
                        values={PRICE_BASES}
                        disabledValues={unavailable}
                        items={Object.fromEntries(
                            PRICE_BASES.map((basis) => [basis, tBases(basis)]),
                        )}
                        onChange={(priceBasis) => patch({ priceBasis })}
                    />
                </div>

                <OptionsDisclosure label={t("rules")}>
                    <div className="flex flex-col gap-4">
                        <RulesPanel rules={form.rules} onChange={patchRules} />
                        <OptionSwitch
                            label={t("minor")}
                            hint={t("minorHint")}
                            checked={form.isMinor}
                            onCheckedChange={(isMinor) => patch({ isMinor })}
                        />
                    </div>
                </OptionsDisclosure>

                <NisabCard snapshot={snapshot} form={form} />

                {/* Above the controls, not in the article: a figure somebody
                    might pay on needs its standing said where it is made. */}
                <p className="text-muted-foreground flex items-start gap-2 text-[0.75rem] leading-5">
                    <IconInfoCircle
                        className="mt-0.5 size-4 shrink-0"
                        stroke={1.8}
                        aria-hidden="true"
                    />
                    {t("disclaimer")}
                </p>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="border-border/70 flex min-w-0 flex-col gap-6 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    <StepLabel step={1}>{t("stepEnter")}</StepLabel>

                    <FormSection title={tSections("prices.title")} hint={tSections("prices.hint")}>
                        <PricePanel snapshot={snapshot} form={form} onChange={patch} />
                    </FormSection>

                    <FormSection title={tSections("cash.title")} hint={tSections("cash.hint")}>
                        {sectionFields("cash")}
                    </FormSection>

                    <FormSection title={tSections("gold.title")} hint={tSections("gold.hint")}>
                        <MetalList
                            metal="gold"
                            items={form.metals}
                            onChange={(metals) => patch({ metals })}
                            newId={newId}
                            errorFor={errorFor}
                            jewelleryExempt={form.rules.jewellery === "exempt"}
                        />
                    </FormSection>

                    <FormSection title={tSections("silver.title")} hint={tSections("silver.hint")}>
                        <MetalList
                            metal="silver"
                            items={form.metals}
                            onChange={(metals) => patch({ metals })}
                            newId={newId}
                            errorFor={errorFor}
                            jewelleryExempt={form.rules.jewellery === "exempt"}
                        />
                    </FormSection>

                    <FormSection
                        title={tSections("savings.title")}
                        hint={tSections("savings.hint")}
                    >
                        {sectionFields(
                            "savings",
                            <>
                                <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                                    <Label htmlFor={sharesId} className="text-xs font-medium">
                                        {tShares("label")}
                                    </Label>
                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)] sm:items-end">
                                        <div className="flex gap-1.5">
                                            <AmountInput
                                                id={sharesId}
                                                value={form.longTermShares.value}
                                                placeholder="0"
                                                invalid={errorFor("longTermShares") !== null}
                                                onValueChange={(value) =>
                                                    patch({
                                                        longTermShares: {
                                                            ...form.longTermShares,
                                                            value,
                                                        },
                                                    })
                                                }
                                            />
                                            <CodeSelect
                                                label={tFields("currencyOf", {
                                                    field: tShares("label"),
                                                })}
                                                value={form.longTermShares.currency}
                                                values={CURRENCY_CODES}
                                                onChange={(currency) =>
                                                    patch({
                                                        longTermShares: {
                                                            ...form.longTermShares,
                                                            currency,
                                                        },
                                                    })
                                                }
                                            />
                                        </div>
                                        <OptionSelect
                                            label={tShares("method")}
                                            value={form.longTermShares.method}
                                            values={SHARE_METHODS}
                                            items={Object.fromEntries(
                                                SHARE_METHODS.map((method) => [
                                                    method,
                                                    tShares(`methods.${method}`),
                                                ]),
                                            )}
                                            onChange={(method) =>
                                                patch({
                                                    longTermShares: {
                                                        ...form.longTermShares,
                                                        method,
                                                    },
                                                })
                                            }
                                        />
                                        <div className="flex min-w-0 flex-col gap-1.5">
                                            <Label
                                                htmlFor={ratioId}
                                                className="text-muted-foreground text-xs"
                                            >
                                                {tShares("ratio")}
                                            </Label>
                                            <AmountInput
                                                id={ratioId}
                                                value={form.longTermShares.ratioPercent}
                                                placeholder="%"
                                                disabled={form.longTermShares.method !== "ratio"}
                                                onValueChange={(ratioPercent) =>
                                                    patch({
                                                        longTermShares: {
                                                            ...form.longTermShares,
                                                            ratioPercent,
                                                        },
                                                    })
                                                }
                                            />
                                        </div>
                                    </div>
                                    {errorFor("longTermShares") !== null && (
                                        <p
                                            role="alert"
                                            className="text-destructive text-[0.6875rem] leading-[1.4]"
                                        >
                                            {errorFor("longTermShares")}
                                        </p>
                                    )}
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {tShares(`hints.${form.longTermShares.method}`)}
                                    </p>
                                </div>
                                <CryptoList
                                    lines={form.crypto}
                                    onChange={(crypto) => patch({ crypto })}
                                    newId={newId}
                                    errorFor={errorFor}
                                />
                            </>,
                        )}
                    </FormSection>

                    <FormSection
                        title={tSections("business.title")}
                        hint={tSections("business.hint")}
                    >
                        {sectionFields("business")}
                    </FormSection>

                    <FormSection title={tSections("owed.title")} hint={tSections("owed.hint")}>
                        {sectionFields("owed")}
                    </FormSection>

                    <FormSection
                        title={tSections("liabilities.title")}
                        hint={tSections("liabilities.hint")}
                    >
                        {sectionFields("liabilities")}
                    </FormSection>

                    <FormSection
                        title={tSections("adjustments.title")}
                        hint={tSections("adjustments.hint")}
                    >
                        {sectionFields("adjustments")}
                    </FormSection>
                </div>

                <div className="min-w-0 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 lg:sticky lg:top-4">
                        <StepLabel step={2}>{t("stepResult")}</StepLabel>
                        <div className={RESULT_TRAY}>
                            <ResultPanel
                                outcome={outcome}
                                comparisons={comparisons}
                                form={settled}
                                blank={isBlank(settled)}
                                stale={stale}
                            />
                        </div>
                        <div className="ring-border/60 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                            <HawlPanel today={today} />
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}

function FormSection({
    title,
    hint,
    children,
}: {
    title: string;
    hint: string;
    children: ReactNode;
}) {
    const id = useId();

    return (
        <section aria-labelledby={id} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
                <h3 id={id} className="text-sm font-medium">
                    {title}
                </h3>
                <p className="text-muted-foreground text-[0.75rem] leading-5">{hint}</p>
            </div>
            {children}
        </section>
    );
}
