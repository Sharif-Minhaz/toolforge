"use client";

import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { StepLabel } from "@/modules/tools/components/workbench-step";

type SidePanelProps = {
    title: string;
    /** Rendered beside the title, e.g. a count. */
    badge?: ReactNode;
    /** Stamps the title as a workbench step, for the panel that holds the answer. */
    step?: number;
    pending: boolean;
    children: ReactNode;
};

/**
 * The collapsible shell the Explanation and Match Information panels share.
 *
 * Open by default and native: on a narrow screen these sit below the workbench
 * and folding one away is the difference between reading the tool and scrolling
 * past it.
 */
export function SidePanel({ title, badge, step, pending, children }: SidePanelProps) {
    return (
        <details
            open
            className="bg-card/60 ring-border/70 group/panel min-w-0 rounded-xl ring-1 ring-inset"
        >
            <summary
                className={cn(
                    "flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    "[&::-webkit-details-marker]:hidden",
                )}
            >
                <IconChevronDown
                    className="text-muted-foreground size-4 shrink-0 -rotate-90 transition-transform duration-200 group-open/panel:rotate-0"
                    stroke={1.9}
                    aria-hidden="true"
                />
                {step === undefined ? (
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] leading-[1.3] font-medium">
                        {title}
                    </span>
                ) : (
                    <StepLabel step={step} className="min-w-0 flex-1">
                        <span className="truncate">{title}</span>
                    </StepLabel>
                )}
                {badge}
            </summary>

            <div
                className={cn(
                    "max-h-96 overflow-y-auto px-3 pt-1 pb-3 transition-opacity duration-200",
                    pending && "opacity-55",
                )}
            >
                {children}
            </div>
        </details>
    );
}
