"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GRAMS_PER_VORI, NISAB_GRAMS } from "../domain/constants";
import { mul, parseExact, toNumber, ZERO } from "../domain/exact";
import type { ZakatForm } from "../domain/form";
import { isFailure, pricesForSettings } from "../domain/pricing";
import type { PriceSnapshot } from "../types";

type NisabCardProps = {
    snapshot: PriceSnapshot;
    form: ZakatForm;
};

/**
 * Today's nisab, large, the first figure on the page — the number people come
 * to check before anything else. The silver nisab leads because it is the one
 * that applies to almost everybody: any cash at all beside the gold puts the
 * Hanafi test on silver, and most bodies use it for money anyway. The gold
 * nisab sits beside it for the reader whose wealth is gold alone.
 *
 * Priced at the market price of pure metal, never at the resale price —
 * nisab is the value of a weight of silver, not what a jeweller would pay.
 */
export function NisabCard({ snapshot, form }: NisabCardProps) {
    const t = useTranslations("zakat.nisabCard");
    const formatter = useFormatter();
    const table = pricesForSettings(snapshot, form);

    if (isFailure(table)) {
        return null;
    }

    const grams = NISAB_GRAMS[form.rules.nisabStandard];
    const silver = mul(parseExact(grams.silver) ?? ZERO, table.silverPure);
    const gold = mul(parseExact(grams.gold) ?? ZERO, table.goldPure);
    const money = (value: number) =>
        formatter.number(value, {
            style: "currency",
            currency: form.currency,
            maximumFractionDigits: 0,
        });
    const vori = (text: string) =>
        formatter.number(Number(text) / Number(GRAMS_PER_VORI), { maximumFractionDigits: 2 });
    const dated =
        form.priceBasis === "spot" && snapshot.silver !== null
            ? snapshot.silver.asOf
            : form.priceBasis !== "custom" && snapshot.bajus?.effectiveDate != null
              ? `${snapshot.bajus.effectiveDate}T12:00:00Z`
              : null;

    return (
        <section
            aria-labelledby="zakat-nisab-title"
            className="bg-success/8 ring-success/25 flex flex-col items-center gap-1 rounded-2xl px-4 py-5 text-center ring-1 ring-inset"
        >
            <h2 id="zakat-nisab-title" className="text-base leading-[1.3] font-semibold">
                {t("title")}
            </h2>
            <p className="flex items-center gap-2">
                <span className="text-success font-mono text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                    {money(toNumber(silver))}
                </span>
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                type="button"
                                aria-label={t("infoLabel")}
                                className="text-success hover:bg-success/10 focus-visible:ring-ring grid size-7 place-items-center rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                            />
                        }
                    >
                        <IconInfoCircle className="size-5" stroke={1.8} aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-left leading-[1.5]">
                        {t("info", {
                            gold: formatter.number(Number(grams.gold)),
                            silver: formatter.number(Number(grams.silver)),
                        })}
                    </TooltipContent>
                </Tooltip>
            </p>
            <p className="text-muted-foreground text-[0.75rem] leading-5">
                {t("silverLine", {
                    grams: formatter.number(Number(grams.silver)),
                    vori: vori(grams.silver),
                })}
            </p>
            <p className="text-[0.8125rem] leading-5">
                {t("goldLine", {
                    value: money(toNumber(gold)),
                    grams: formatter.number(Number(grams.gold)),
                    vori: vori(grams.gold),
                })}
            </p>
            {/* The tooltip's text, for anybody who cannot hover. */}
            <p className="sr-only">
                {t("info", {
                    gold: formatter.number(Number(grams.gold)),
                    silver: formatter.number(Number(grams.silver)),
                })}
            </p>
            {dated !== null && (
                <p className="text-muted-foreground text-[0.6875rem]">
                    {t("updated", {
                        date: formatter.dateTime(new Date(dated), {
                            dateStyle: "medium",
                            timeZone: "UTC",
                        }),
                    })}
                </p>
            )}
        </section>
    );
}
