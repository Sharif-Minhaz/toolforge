"use client";

import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";

type UnitRowProps = {
    name: string;
    /** "1 katha = 720 sq ft", so the size the figure assumes is never hidden; `null` for sq ft itself. */
    definition: string | null;
    value: string;
    /** "Typed" on the unit the number was entered in, a district on a regional unit. */
    tags: readonly string[];
    highlighted: boolean;
    copyLabel: string;
    copied: boolean;
    dimmed: boolean;
    onCopy: () => void;
};

/** One unit's figure: its name and size on the left, the figure and a copy button on the right. */
export function UnitRow({
    name,
    definition,
    value,
    tags,
    highlighted,
    copyLabel,
    copied,
    dimmed,
    onCopy,
}: UnitRowProps) {
    return (
        <li
            className={cn(
                "flex min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset",
                highlighted ? "bg-primary/8 ring-primary/40" : "bg-card ring-border/70",
            )}
        >
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[0.8125rem] leading-[1.3] font-medium">{name}</span>
                    {tags.map((tag) => (
                        <span
                            key={tag}
                            className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[0.625rem] leading-[1.3] font-medium"
                        >
                            {tag}
                        </span>
                    ))}
                </span>
                {definition !== null && (
                    <span className="text-muted-foreground text-[0.6875rem] leading-[1.4] tabular-nums">
                        {definition}
                    </span>
                )}
            </span>
            <span className="flex min-w-0 items-center gap-1">
                <span
                    className={cn(
                        "text-right font-mono text-sm break-all tabular-nums",
                        "transition-opacity duration-200",
                        dimmed && "opacity-55",
                    )}
                >
                    {value}
                </span>
                <IconCopyButton
                    copied={copied}
                    onClick={onCopy}
                    disabled={value.length === 0}
                    aria-label={copyLabel}
                    // A thumb needs more than the 28 px a pointer does.
                    className="shrink-0 disabled:pointer-events-none disabled:opacity-40 max-lg:size-9"
                />
            </span>
        </li>
    );
}
