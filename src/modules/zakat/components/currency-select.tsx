"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CodeSelectProps<T extends string> = {
    value: T;
    values: readonly T[];
    onChange: (value: T) => void;
    /** Names the control for a screen reader; the trigger shows only the code. */
    label: string;
    className?: string;
    id?: string;
};

/**
 * A currency or coin code beside an amount. ISO codes are data, not copy, so
 * they are shown as they are in both languages.
 */
export function CodeSelect<T extends string>({
    value,
    values,
    onChange,
    label,
    className,
    id,
}: CodeSelectProps<T>) {
    return (
        <Select
            items={Object.fromEntries(values.map((code) => [code, code]))}
            value={value}
            onValueChange={(next) => {
                if (next !== null) {
                    onChange(next);
                }
            }}
        >
            <SelectTrigger
                id={id}
                aria-label={label}
                className={cn("w-[5.5rem] shrink-0 font-mono text-xs", className)}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
                {values.map((code) => (
                    <SelectItem key={code} value={code} className="font-mono text-xs">
                        {code}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
