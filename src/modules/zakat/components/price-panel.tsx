"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { GRAMS_PER_VORI, MAX_RESALE_DEDUCTION } from "../domain/constants";
import { mul, parseExact, toNumber, ZERO } from "../domain/exact";
import type { ZakatForm } from "../domain/form";
import { isFailure, pricesForSettings, readDeduction } from "../domain/pricing";
import type { Karat, PriceSnapshot } from "../types";
import { AmountInput } from "./amount-input";
import { usePurityLabel } from "./use-purity-label";

/** The grades a Bangladeshi jeweller deals in, gold first. */
const ROWS: readonly { metal: "gold" | "silver"; karat: Karat }[] = [
    { metal: "gold", karat: 22 },
    { metal: "gold", karat: 21 },
    { metal: "gold", karat: 18 },
    { metal: "gold", karat: "traditional" },
    { metal: "silver", karat: 22 },
    { metal: "silver", karat: "traditional" },
];

type PricePanelProps = {
    snapshot: PriceSnapshot;
    form: ZakatForm;
    onChange: (patch: Partial<Pick<ZakatForm, "customPrices" | "resaleDeduction">>) => void;
};

/**
 * What one gram and one vori of each grade is worth to its owner today, with
 * where the price came from and when. Never hidden: a zakat figure is only as
 * good as the price under it, and a reader must be able to check it against
 * the shop.
 */
export function PricePanel({ snapshot, form, onChange }: PricePanelProps) {
    const t = useTranslations("zakat.prices");
    const tErrors = useTranslations("zakat.errors");
    const formatter = useFormatter();
    const purityLabel = usePurityLabel();
    const goldId = useId();
    const silverId = useId();
    const deductionId = useId();
    const deductionHintId = useId();

    const { priceBasis: basis, currency } = form;
    const table = pricesForSettings(snapshot, form);
    const vori = parseExact(GRAMS_PER_VORI) ?? ZERO;
    const money = (value: number) =>
        formatter.number(value, { style: "currency", currency, maximumFractionDigits: 0 });
    const day = (iso: string) =>
        formatter.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "UTC" });

    const source = (() => {
        switch (basis) {
            case "spot":
                return snapshot.gold === null
                    ? null
                    : t(
                          snapshot.gold.source === "gold-api"
                              ? "sources.spotLive"
                              : "sources.spotDaily",
                          {
                              time: formatter.dateTime(new Date(snapshot.gold.asOf), {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: "UTC",
                              }),
                          },
                      );
            case "bajusResale":
            case "bajusRetail":
                return snapshot.bajus === null
                    ? null
                    : t(basis === "bajusResale" ? "sources.bajusResale" : "sources.bajusRetail", {
                          date:
                              snapshot.bajus.effectiveDate === null
                                  ? t("sources.undated")
                                  : day(`${snapshot.bajus.effectiveDate}T12:00:00Z`),
                      });
            case "custom":
                return t("sources.custom");
        }
    })();

    const rates =
        snapshot.rates === null || currency === "USD" || (currency === "BDT" && basis !== "spot")
            ? null
            : t("sources.rates", {
                  source: snapshot.rates.source === "frankfurter" ? "Frankfurter" : "currency-api",
                  time: day(snapshot.rates.asOf),
              });

    const deductionInvalid =
        basis === "bajusResale" && readDeduction(form.resaleDeduction) === null;

    return (
        <div className="flex flex-col gap-3">
            {basis === "custom" && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={goldId} className="text-xs font-medium">
                            {t("customGold", { currency })}
                        </Label>
                        <AmountInput
                            id={goldId}
                            value={form.customPrices.gold}
                            placeholder="0"
                            onValueChange={(gold) =>
                                onChange({ customPrices: { ...form.customPrices, gold } })
                            }
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={silverId} className="text-xs font-medium">
                            {t("customSilver", { currency })}
                        </Label>
                        <AmountInput
                            id={silverId}
                            value={form.customPrices.silver}
                            placeholder="0"
                            onValueChange={(silver) =>
                                onChange({ customPrices: { ...form.customPrices, silver } })
                            }
                        />
                    </div>
                </div>
            )}

            {basis === "bajusResale" && (
                <div className="flex max-w-xs flex-col gap-1.5">
                    <Label htmlFor={deductionId} className="text-xs font-medium">
                        {t("deduction")}
                    </Label>
                    <div className="flex items-center gap-2">
                        <AmountInput
                            id={deductionId}
                            value={form.resaleDeduction}
                            invalid={deductionInvalid}
                            aria-describedby={deductionHintId}
                            className="w-24"
                            onValueChange={(resaleDeduction) => onChange({ resaleDeduction })}
                        />
                        <span className="text-muted-foreground text-sm">%</span>
                    </div>
                    {deductionInvalid && (
                        <p role="alert" className="text-destructive text-[0.6875rem] leading-[1.4]">
                            {tErrors("invalid_deduction", {
                                max: formatter.number(MAX_RESALE_DEDUCTION),
                            })}
                        </p>
                    )}
                    <p
                        id={deductionHintId}
                        className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                    >
                        {t("deductionHint")}
                    </p>
                </div>
            )}

            {isFailure(table) ? (
                table.reason === "invalid_deduction" ? null : (
                    <StatusStrip
                        tone="warning"
                        message={tErrors(table.reason, {
                            code: table.code ?? "",
                            max: formatter.number(MAX_RESALE_DEDUCTION),
                        })}
                    />
                )
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-88 text-[0.8125rem]">
                        <caption className="sr-only">{t("caption", { currency })}</caption>
                        <thead>
                            <tr className="text-muted-foreground text-left text-xs">
                                <th scope="col" className="py-1.5 pr-3 font-medium">
                                    {t("grade")}
                                </th>
                                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                                    {t("perGram")}
                                </th>
                                <th scope="col" className="py-1.5 text-right font-medium">
                                    {t("perVori")}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="font-mono tabular-nums">
                            {ROWS.map(({ metal, karat }) => {
                                const perGram = table.itemPerGram(metal, karat);

                                return (
                                    <tr
                                        key={`${metal}-${karat}`}
                                        className="border-border/60 border-t"
                                    >
                                        <th
                                            scope="row"
                                            className="py-1.5 pr-3 text-left font-sans font-normal"
                                        >
                                            {t("gradeName", {
                                                metal: t(`metals.${metal}`),
                                                purity: purityLabel(metal, karat),
                                            })}
                                        </th>
                                        <td className="py-1.5 pr-3 text-right">
                                            {perGram === null ? "—" : money(toNumber(perGram))}
                                        </td>
                                        <td className="py-1.5 text-right">
                                            {perGram === null
                                                ? "—"
                                                : money(toNumber(mul(perGram, vori)))}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {(source !== null || rates !== null) && (
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.5]">
                    {source}
                    {rates !== null && <span className="block">{rates}</span>}
                </p>
            )}
        </div>
    );
}
