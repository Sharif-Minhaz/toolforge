"use client";

import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * The two controls every tool's option panel is built from. Both carry their
 * own label and hint wiring, which is the part that is easy to get subtly wrong:
 * Base UI's `Switch` renders a `<button role="switch">`, so `<label htmlFor>`
 * does not associate with it and `aria-labelledby` has to do the work.
 */

type OptionSelectProps<T extends string> = {
    label: ReactNode;
    hint?: ReactNode;
    value: T;
    /** Base UI needs the full value → label map on the root, or the trigger
     *  shows the raw value instead of the label. */
    items: Record<string, ReactNode>;
    values: readonly T[];
    disabled?: boolean;
    onChange: (value: T) => void;
};

export function OptionSelect<T extends string>({
    label,
    hint,
    value,
    items,
    values,
    disabled,
    onChange,
}: OptionSelectProps<T>) {
    const labelId = useId();

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label id={labelId} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{label}</span>
            </Label>
            <Select
                items={items}
                value={value}
                disabled={disabled}
                onValueChange={(next) => {
                    if (next !== null) {
                        onChange(next);
                    }
                }}
            >
                <SelectTrigger aria-labelledby={labelId} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                    {values.map((item) => (
                        <SelectItem key={item} value={item}>
                            {items[item]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {hint !== undefined && (
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">{hint}</p>
            )}
        </div>
    );
}

type OptionSwitchProps = {
    label: ReactNode;
    hint: ReactNode;
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
};

export function OptionSwitch({
    label,
    hint,
    checked,
    disabled,
    onCheckedChange,
}: OptionSwitchProps) {
    const labelId = useId();
    const hintId = useId();

    return (
        <div
            className={cn(
                "bg-card/60 ring-border/70 flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset",
                "transition-opacity duration-200",
                disabled && "opacity-55",
            )}
        >
            <span className="flex min-w-0 flex-col gap-0.5">
                <span id={labelId} className="text-[0.8125rem] leading-[1.3] font-medium">
                    {label}
                </span>
                <span id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {hint}
                </span>
            </span>
            <Switch
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => onCheckedChange(next)}
                aria-labelledby={labelId}
                aria-describedby={hintId}
                className="mt-1 shrink-0"
            />
        </div>
    );
}
