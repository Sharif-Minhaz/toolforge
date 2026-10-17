import type { IconProps } from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The standing facts under a workbench — what a run destroys, where the bytes
 * go — as titled callouts rather than a footer of small grey sentences. A
 * reader skims the titles; the sentence is there for the one who wants it.
 *
 * Server-safe: no state, no hooks, so a client island can render it and so
 * can a page.
 */

export type ToolNote = {
    readonly key: string;
    readonly icon: ComponentType<IconProps>;
    readonly title: ReactNode;
    readonly body: ReactNode;
    /** `success` for a promise kept (nothing uploaded); `muted` for a plain fact. */
    readonly tone?: "success" | "muted";
};

type ToolNotesProps = {
    readonly notes: readonly ToolNote[];
    readonly className?: string;
};

export function ToolNotes({ notes, className }: ToolNotesProps) {
    return (
        <ul
            className={cn(
                "grid min-w-0 gap-2.5",
                // A lone note at half width reads as a missing partner.
                notes.length > 1 && "md:grid-cols-2",
                className,
            )}
        >
            {notes.map(({ key, icon: Icon, title, body, tone = "muted" }) => (
                <li
                    key={key}
                    className="bg-muted/25 ring-border/60 flex min-w-0 items-start gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset"
                >
                    <span
                        aria-hidden="true"
                        className={cn(
                            "ring-border/70 grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                            tone === "success"
                                ? "bg-[color-mix(in_oklch,var(--color-success)_12%,transparent)] text-[var(--color-success)]"
                                : "bg-background/60 text-muted-foreground",
                        )}
                    >
                        <Icon className="size-4" stroke={1.8} />
                    </span>

                    <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[0.8125rem] leading-[1.4] font-medium">{title}</span>
                        <span className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                            {body}
                        </span>
                    </span>
                </li>
            ))}
        </ul>
    );
}
