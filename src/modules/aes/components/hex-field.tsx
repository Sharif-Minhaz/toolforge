"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { FieldAction, FieldDivider, FieldShell, FIELD_INPUT } from "./field-shell";

type HexFieldProps = {
    label: string;
    hint: string;
    value: string;
    /**
     * Capped rather than metered. These are fixed-width identifiers — a
     * thirty-third byte of IV is a mistake every time, and refusing the
     * keystroke costs nothing.
     */
    maxLength: number;
    disabled: boolean;
    invalid: boolean;
    copied: boolean;
    regenerateLabel: string;
    copyLabel: string;
    /** Rendered beside the label — the GCM nonce puts its width picker here. */
    trailing?: ReactNode;
    onChange: (value: string) => void;
    onRegenerate: () => void;
    onCopy: () => void;
};

/** One salt or IV row: the value, a fresh draw, and a copy. */
export function HexField({
    label,
    hint,
    value,
    maxLength,
    disabled,
    invalid,
    copied,
    regenerateLabel,
    copyLabel,
    trailing,
    onChange,
    onRegenerate,
    onCopy,
}: HexFieldProps) {
    const inputId = useId();
    const hintId = useId();

    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", disabled && "opacity-55")}>
            {/* Fixed height rather than `min-h`: this row holds a bare label in
                one column and a select in the other, and the two have to land
                on the same line. */}
            <div className="flex h-7 items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-muted-foreground truncate text-xs">
                    <span className="leading-[1.3]">{label}</span>
                </Label>
                {trailing}
            </div>

            <FieldShell invalid={invalid} disabled={disabled}>
                <input
                    id={inputId}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    maxLength={maxLength}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    aria-describedby={hintId}
                    aria-invalid={invalid}
                    className={FIELD_INPUT}
                />

                <FieldDivider />

                <FieldAction label={regenerateLabel} disabled={disabled} onClick={onRegenerate}>
                    <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
                </FieldAction>
                <IconCopyButton
                    copied={copied}
                    onClick={onCopy}
                    disabled={disabled || value.length === 0}
                    aria-label={copyLabel}
                    title={copyLabel}
                    className="disabled:pointer-events-none disabled:opacity-40"
                />
            </FieldShell>

            {/* Under the field, not above it. A hint that wraps to a different
                number of lines than its neighbour's would otherwise push the
                two inputs onto different rows — and it is where every other
                field on the site keeps its hint. */}
            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {hint}
            </p>
        </div>
    );
}
