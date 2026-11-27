"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { MAX_LABEL_LENGTH, MAX_METAL_ITEMS } from "../domain/constants";
import { toDecimal } from "../domain/exact";
import { toGrams, toTraditional } from "../domain/units";
import { KARATS, METAL_USES, WEIGHT_UNITS, type MetalItem } from "../types";
import { AmountInput } from "./amount-input";
import { usePurityLabel } from "./use-purity-label";

type MetalListProps = {
    metal: "gold" | "silver";
    items: readonly MetalItem[];
    onChange: (items: readonly MetalItem[]) => void;
    /** Generates a row id; called in the event handler, never during render. */
    newId: () => string;
    errorFor: (id: string) => string | null;
    /** The jewellery rule makes worn pieces exempt: say so on the row. */
    jewelleryExempt: boolean;
};

/** Pieces of gold or silver, each weighed in the reader's own unit. */
export function MetalList({
    metal,
    items,
    onChange,
    newId,
    errorFor,
    jewelleryExempt,
}: MetalListProps) {
    const t = useTranslations("zakat.metals");
    const own = items.filter((item) => item.metal === metal);
    const others = items.filter((item) => item.metal !== metal);

    function update(id: string, patch: Partial<MetalItem>) {
        onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    }

    function add() {
        onChange([
            ...items,
            {
                id: newId(),
                metal,
                label: "",
                weight: "",
                unit: "vori",
                // 22 karat is what most Bangladeshi jewellery is, gold and silver alike.
                karat: 22,
                use: "jewellery",
            },
        ]);
    }

    return (
        <div className="flex flex-col gap-3">
            {own.length === 0 && (
                <p className="text-muted-foreground text-[0.75rem] leading-5">
                    {t(`empty.${metal}`)}
                </p>
            )}
            {own.map((item, index) => (
                <MetalRow
                    key={item.id}
                    item={item}
                    position={index + 1}
                    error={errorFor(item.id)}
                    jewelleryExempt={jewelleryExempt}
                    onChange={(patch) => update(item.id, patch)}
                    onRemove={() =>
                        onChange([...others, ...own.filter((other) => other.id !== item.id)])
                    }
                />
            ))}
            <div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={add}
                    disabled={items.length >= MAX_METAL_ITEMS}
                >
                    <IconPlus className="size-3.5" stroke={1.8} aria-hidden="true" />
                    {t(`add.${metal}`)}
                </Button>
            </div>
        </div>
    );
}

type MetalRowProps = {
    item: MetalItem;
    position: number;
    error: string | null;
    jewelleryExempt: boolean;
    onChange: (patch: Partial<MetalItem>) => void;
    onRemove: () => void;
};

function MetalRow({ item, position, error, jewelleryExempt, onChange, onRemove }: MetalRowProps) {
    const t = useTranslations("zakat.metals");
    const formatter = useFormatter();
    const purityLabel = usePurityLabel();
    const weightId = useId();
    const nameId = useId();
    const hintId = useId();

    const grams = item.weight.trim().length === 0 ? null : toGrams(item.weight, item.unit);
    const traditional = grams === null ? null : toTraditional(grams);
    const conversion =
        grams === null || traditional === null
            ? null
            : t("conversion", {
                  grams: formatter.number(Number(toDecimal(grams, 4)), {
                      maximumFractionDigits: 4,
                  }),
                  vori: formatter.number(traditional.vori),
                  ana: formatter.number(traditional.ana),
                  rati: formatter.number(traditional.rati),
                  point: formatter.number(traditional.point),
              });

    return (
        <fieldset className="ring-border/60 flex min-w-0 flex-col gap-3 rounded-xl p-3 ring-1 ring-inset">
            <legend className="sr-only">
                {t("rowLegend", { metal: t(`names.${item.metal}`), position })}
            </legend>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={nameId} className="text-muted-foreground text-xs">
                        {t("name")}
                    </Label>
                    <Input
                        id={nameId}
                        value={item.label}
                        maxLength={MAX_LABEL_LENGTH}
                        placeholder={t(`namePlaceholder.${item.metal}`)}
                        onChange={(event) => onChange({ label: event.target.value })}
                    />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={weightId} className="text-muted-foreground text-xs">
                        {t("weight")}
                    </Label>
                    <AmountInput
                        id={weightId}
                        value={item.weight}
                        placeholder="0"
                        invalid={error !== null}
                        aria-describedby={hintId}
                        onValueChange={(weight) => onChange({ weight })}
                    />
                </div>
                <OptionSelect
                    label={t("unit")}
                    value={item.unit}
                    values={WEIGHT_UNITS}
                    items={Object.fromEntries(
                        WEIGHT_UNITS.map((unit) => [unit, t(`units.${unit}`)]),
                    )}
                    onChange={(unit) => onChange({ unit })}
                />
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <OptionSelect
                    label={t("purity")}
                    value={String(item.karat)}
                    values={KARATS.map(String)}
                    items={Object.fromEntries(
                        KARATS.map((karat) => [String(karat), purityLabel(item.metal, karat)]),
                    )}
                    onChange={(value) =>
                        onChange({
                            karat: KARATS.find((karat) => String(karat) === value) ?? item.karat,
                        })
                    }
                />
                <OptionSelect
                    label={t("use")}
                    value={item.use}
                    values={METAL_USES}
                    items={Object.fromEntries(METAL_USES.map((use) => [use, t(`uses.${use}`)]))}
                    onChange={(use) => onChange({ use })}
                />
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRemove}
                    aria-label={t("remove", { metal: t(`names.${item.metal}`), position })}
                    className="text-muted-foreground hover:text-destructive h-9"
                >
                    <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                </Button>
            </div>
            {error !== null && (
                <p role="alert" className="text-destructive text-[0.6875rem] leading-[1.4]">
                    {error}
                </p>
            )}
            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {conversion ?? t("weightHint")}
                {jewelleryExempt && item.use === "jewellery" && (
                    <span className="text-foreground/80 block pt-0.5">{t("exemptNote")}</span>
                )}
            </p>
        </fieldset>
    );
}
