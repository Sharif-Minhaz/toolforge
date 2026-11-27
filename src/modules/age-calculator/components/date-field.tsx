"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MAX_DATE_INPUT_LENGTH } from "../domain/constants";

type DateFieldProps = {
    id: string;
    label: ReactNode;
    value: string;
    placeholder: string;
    hint: ReactNode;
    /** Rendered under the box, in place of the hint, when the date was not read. */
    error: string | null;
    /** Buttons that fill the field in one press — Today, a known relaxation date. */
    actions?: ReactNode;
    /** The calendar button, sat inside the box's right edge. */
    picker: ReactNode;
    onChange: (value: string) => void;
};

/**
 * A typed date with a calendar inside its right edge. Typing stays first-class
 * — `12/05/1998` is faster than any calendar for a date decades back — and the
 * calendar is there for the reader who would rather point. Capped, because a
 * date is a short field and one character too many is a mistake rather than a
 * document cut short.
 */
export function DateField({
    id,
    label,
    value,
    placeholder,
    hint,
    error,
    actions,
    picker,
    onChange,
}: DateFieldProps) {
    const hintId = `${id}-hint`;

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                <Label htmlFor={id} className="text-[0.8125rem] leading-[1.3] font-medium">
                    {label}
                </Label>
                {actions !== undefined && (
                    <div className="flex flex-wrap items-center gap-1">{actions}</div>
                )}
            </div>
            <div className="relative">
                <Input
                    id={id}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    maxLength={MAX_DATE_INPUT_LENGTH}
                    // No numeric keypad: iOS's has no slash, and the slash is the
                    // separator the hint teaches.
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={error !== null}
                    aria-describedby={hintId}
                    className="bg-card/70 h-11 rounded-xl pr-11 font-mono text-base tabular-nums"
                />
                <div className="absolute inset-y-0 right-1.5 flex items-center">{picker}</div>
            </div>
            <p
                id={hintId}
                className={cn(
                    "text-[0.6875rem] leading-[1.4]",
                    error === null ? "text-muted-foreground" : "text-destructive",
                )}
            >
                {error ?? hint}
            </p>
        </div>
    );
}

/** The small text buttons beside a date field's label. */
export function FieldAction({
    children,
    pressed,
    onClick,
}: {
    children: ReactNode;
    pressed?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            className={cn(
                "h-7 rounded-lg px-2 text-xs leading-[1.3] transition-colors duration-200",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                pressed
                    ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                    : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
            )}
        >
            {children}
        </button>
    );
}
