"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * `#rrggbb` and nothing else — every caller's schema refuses shorthand and
 * names, so there is no longer spelling to leave room for.
 */
const HEX_COLOR_LENGTH = 7;

type ColorFieldProps = {
    label: string;
    value: string;
    /**
     * What the native picker shows when `value` is not a colour of its own —
     * the QR tool's `transparent`, say. Defaults to `value`.
     */
    swatch?: string;
    disabled?: boolean;
    onChange: (value: string) => void;
};

/**
 * A swatch and the hex beside it. Both write the same value: the picker is the
 * fast way in, and the text field is the only way to paste a brand colour.
 */
export function ColorField({ label, value, swatch = value, disabled, onChange }: ColorFieldProps) {
    const id = useId();

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{label}</span>
            </Label>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    aria-label={label}
                    disabled={disabled}
                    value={swatch}
                    onChange={(event) => onChange(event.target.value)}
                    className={cn(
                        "ring-border/70 size-9 shrink-0 cursor-pointer rounded-lg bg-transparent ring-1 ring-inset",
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                        "disabled:cursor-not-allowed disabled:opacity-55",
                    )}
                />
                <Input
                    id={id}
                    // No meter: a seven-character ceiling has no "nearly full"
                    // worth reporting.
                    maxLength={HEX_COLOR_LENGTH}
                    value={value}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => onChange(event.target.value)}
                    className="font-mono text-xs"
                />
            </div>
        </div>
    );
}
