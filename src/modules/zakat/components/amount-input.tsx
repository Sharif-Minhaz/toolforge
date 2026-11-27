"use client";

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MAX_AMOUNT_LENGTH } from "../domain/constants";

type AmountInputProps = Omit<ComponentProps<typeof Input>, "type" | "inputMode" | "onChange"> & {
    value: string;
    onValueChange: (value: string) => void;
    invalid?: boolean;
};

/**
 * One amount. A short identity field, so it is capped (`CLAUDE.md` rule 42):
 * no real amount needs more characters than the cap, and refusing a keystroke
 * past it costs nothing. Text rather than `type="number"`, which would drop
 * the lakh grouping, Bangla digits and a trailing point mid-typing; the domain
 * parser decides what the text means.
 */
export function AmountInput({
    value,
    onValueChange,
    invalid,
    className,
    ...props
}: AmountInputProps) {
    return (
        <Input
            {...props}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_AMOUNT_LENGTH}
            value={value}
            aria-invalid={invalid || undefined}
            onChange={(event) => onValueChange(event.target.value)}
            className={cn("font-mono tabular-nums", className)}
        />
    );
}
