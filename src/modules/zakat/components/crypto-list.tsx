"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_CRYPTO_LINES } from "../domain/constants";
import { CRYPTO_CODES, type CryptoLine } from "../types";
import { AmountInput } from "./amount-input";
import { CodeSelect } from "./currency-select";

type CryptoListProps = {
    lines: readonly CryptoLine[];
    onChange: (lines: readonly CryptoLine[]) => void;
    newId: () => string;
    errorFor: (id: string) => string | null;
};

/** Coins, in coins: the price comes from the day's rate table. */
export function CryptoList({ lines, onChange, newId, errorFor }: CryptoListProps) {
    const t = useTranslations("zakat.crypto");

    return (
        <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-xs font-medium">{t("label")}</span>
            {lines.map((line, index) => (
                <CryptoRow
                    key={line.id}
                    line={line}
                    position={index + 1}
                    error={errorFor(line.id)}
                    onChange={(patch) =>
                        onChange(
                            lines.map((other) =>
                                other.id === line.id ? { ...other, ...patch } : other,
                            ),
                        )
                    }
                    onRemove={() => onChange(lines.filter((other) => other.id !== line.id))}
                />
            ))}
            <div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={lines.length >= MAX_CRYPTO_LINES}
                    onClick={() => onChange([...lines, { id: newId(), coin: "BTC", amount: "" }])}
                >
                    <IconPlus className="size-3.5" stroke={1.8} aria-hidden="true" />
                    {t("add")}
                </Button>
            </div>
            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">{t("hint")}</p>
        </div>
    );
}

type CryptoRowProps = {
    line: CryptoLine;
    position: number;
    error: string | null;
    onChange: (patch: Partial<CryptoLine>) => void;
    onRemove: () => void;
};

function CryptoRow({ line, position, error, onChange, onRemove }: CryptoRowProps) {
    const t = useTranslations("zakat.crypto");
    const id = useId();

    return (
        <div className="flex flex-col gap-1">
            <Label htmlFor={id} className="sr-only">
                {t("amountLabel", { position })}
            </Label>
            <div className="flex gap-1.5">
                <AmountInput
                    id={id}
                    value={line.amount}
                    placeholder="0"
                    invalid={error !== null}
                    onValueChange={(amount) => onChange({ amount })}
                />
                <CodeSelect
                    label={t("coinLabel", { position })}
                    value={line.coin}
                    values={CRYPTO_CODES}
                    onChange={(coin) => onChange({ coin })}
                />
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRemove}
                    aria-label={t("remove", { position })}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                >
                    <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                </Button>
            </div>
            {error !== null && (
                <p role="alert" className="text-destructive text-[0.6875rem] leading-[1.4]">
                    {error}
                </p>
            )}
        </div>
    );
}
