"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export const DECODED_VIEWS = ["json", "claims"] as const;

export type DecodedView = (typeof DECODED_VIEWS)[number];

type ViewToggleProps = {
    value: DecodedView;
    onChange: (view: DecodedView) => void;
    labelId: string;
};

/** Switches both decoded panels between raw JSON and an explained table. */
export function ViewToggle({ value, onChange, labelId }: ViewToggleProps) {
    const t = useTranslations("jwt.workbench.views");

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="bg-muted/70 ring-border/60 inline-flex gap-0.5 rounded-lg p-0.5 ring-1 ring-inset"
        >
            {DECODED_VIEWS.map((view) => {
                const selected = view === value;

                return (
                    <button
                        key={view}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(view)}
                        className={cn(
                            "rounded-md px-2.5 py-1 text-[0.6875rem] leading-[1.4] font-medium",
                            "transition-colors duration-200 outline-none",
                            "focus-visible:ring-ring focus-visible:ring-2",
                            selected
                                ? "bg-card text-foreground ring-border shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t(view)}
                    </button>
                );
            })}
        </div>
    );
}
