"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";

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
    onChange,
    onRegenerate,
    onCopy,
}: HexFieldProps) {
    const inputId = useId();
    const hintId = useId();

    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", disabled && "opacity-55")}>
            <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{label}</span>
            </Label>

            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {hint}
            </p>

            <div className="flex items-center gap-1.5">
                <Input
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
                    className="h-9 min-w-0 flex-1 font-mono text-[0.8125rem]"
                />
                <button
                    type="button"
                    onClick={onRegenerate}
                    disabled={disabled}
                    aria-label={regenerateLabel}
                    className={cn(
                        "text-muted-foreground grid size-7 shrink-0 place-items-center rounded-lg",
                        "hover:bg-muted hover:text-foreground transition-colors duration-200",
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                        "disabled:pointer-events-none disabled:opacity-40",
                    )}
                >
                    <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
                </button>
                <IconCopyButton
                    copied={copied}
                    onClick={onCopy}
                    disabled={disabled || value.length === 0}
                    aria-label={copyLabel}
                    className="disabled:pointer-events-none disabled:opacity-40"
                />
            </div>
        </div>
    );
}
