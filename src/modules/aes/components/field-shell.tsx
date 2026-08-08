"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A single-line field that carries its own buttons.
 *
 * Every field in this tool has something to press beside it — draw a fresh one,
 * reveal it, copy it — and hanging those off the outside of a bordered input
 * reads as two unrelated controls that happen to be adjacent. The shell owns
 * the border and the focus ring instead, and the input inside it is bare, so
 * the whole row is one object that lights up when any part of it is focused.
 *
 * Modelled on the Hash tool's stepper, which solves the same problem for a
 * number. Kept local rather than lifted: two tools using a composite-field
 * shape is not yet a shape, and this one carries an invalid state that one
 * does not.
 */

/** Applied to the bare `<input>` inside a shell. */
export const FIELD_INPUT = cn(
    "h-9 min-w-0 flex-1 bg-transparent px-2.5 outline-none",
    "font-mono text-[0.8125rem]",
    "placeholder:text-muted-foreground disabled:cursor-not-allowed",
);

type FieldShellProps = {
    invalid?: boolean;
    disabled?: boolean;
    children: ReactNode;
};

export function FieldShell({ invalid = false, disabled = false, children }: FieldShellProps) {
    return (
        <div
            className={cn(
                "bg-card ring-input flex h-9 items-center gap-0.5 rounded-xl pr-1 ring-1 ring-inset",
                "transition-colors duration-200",
                "focus-within:ring-ring focus-within:ring-2",
                invalid && "ring-destructive/70 focus-within:ring-destructive",
                // Only the fill. Dimming is the caller's job, so a disabled
                // field and its label fade together instead of twice over.
                disabled && "bg-input/30",
            )}
        >
            {children}
        </div>
    );
}

/**
 * Separates the value from the things you can do to it, so the buttons read as
 * a group rather than as trailing content of the field.
 */
export function FieldDivider() {
    return <span aria-hidden="true" className="bg-border/70 mx-0.5 h-4.5 w-px shrink-0" />;
}

type FieldActionProps = {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
};

/** One icon button inside a shell, sized to match the shared copy button. */
export function FieldAction({ label, disabled = false, onClick, children }: FieldActionProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className={cn(
                "text-muted-foreground grid size-7 shrink-0 place-items-center rounded-lg",
                "hover:bg-muted hover:text-foreground transition-colors duration-200",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-40",
            )}
        >
            {children}
        </button>
    );
}
