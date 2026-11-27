"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import {
    fieldOf,
    MONEY_SECTIONS,
    type MoneyField,
    type MoneySection,
    type ZakatForm,
} from "../domain/form";
import { CURRENCY_CODES, type MoneyKind } from "../types";
import { AmountInput } from "./amount-input";
import { CodeSelect } from "./currency-select";

type MoneySectionProps = {
    section: MoneySection;
    form: ZakatForm;
    onChange: (kind: MoneyKind, field: MoneyField) => void;
    /** The message under a field the last calculation refused, by kind. */
    errorFor: (kind: MoneyKind) => string | null;
    /** A note a rule attaches to a field — "not deducted under this view". */
    noteFor?: (kind: MoneyKind) => string | null;
    children?: ReactNode;
};

/** One group of amounts, each with its own currency. */
export function MoneySectionFields({
    section,
    form,
    onChange,
    errorFor,
    noteFor,
    children,
}: MoneySectionProps) {
    const t = useTranslations("zakat.fields");

    return (
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {MONEY_SECTIONS[section].map((kind) => (
                <MoneyFieldRow
                    key={kind}
                    label={t(`${kind}.label`)}
                    hint={t(`${kind}.hint`)}
                    currencyLabel={t("currencyOf", { field: t(`${kind}.label`) })}
                    field={fieldOf(form, kind)}
                    error={errorFor(kind)}
                    note={noteFor?.(kind) ?? null}
                    onChange={(field) => onChange(kind, field)}
                />
            ))}
            {children}
        </div>
    );
}

type MoneyFieldRowProps = {
    label: string;
    hint: string;
    currencyLabel: string;
    field: MoneyField;
    error: string | null;
    note: string | null;
    onChange: (field: MoneyField) => void;
};

export function MoneyFieldRow({
    label,
    hint,
    currencyLabel,
    field,
    error,
    note,
    onChange,
}: MoneyFieldRowProps) {
    const id = useId();
    const hintId = useId();
    const errorId = useId();

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id} className="text-xs leading-[1.3] font-medium">
                {label}
            </Label>
            <div className="flex gap-1.5">
                <AmountInput
                    id={id}
                    value={field.amount}
                    placeholder="0"
                    invalid={error !== null}
                    aria-describedby={error === null ? hintId : `${errorId} ${hintId}`}
                    onValueChange={(amount) => onChange({ ...field, amount })}
                />
                <CodeSelect
                    label={currencyLabel}
                    value={field.currency}
                    values={CURRENCY_CODES}
                    onChange={(currency) => onChange({ ...field, currency })}
                />
            </div>
            {error !== null && (
                <p
                    id={errorId}
                    role="alert"
                    className="text-destructive text-[0.6875rem] leading-[1.4]"
                >
                    {error}
                </p>
            )}
            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {hint}
                {note !== null && <span className="text-foreground/80 block pt-0.5">{note}</span>}
            </p>
        </div>
    );
}
