import type { IconProps } from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The standing facts under a workbench — what a run destroys, what an edit
 * needs the reader's rights to — as titled callouts rather than a footer of small grey sentences. A
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
            {notes.map(({ key, icon: Icon, title, body }) => (
                <li
                    key={key}
                    className="bg-muted/25 ring-border/60 flex min-w-0 items-start gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset"
                >
                    <span
                        aria-hidden="true"
                        className="ring-border/70 bg-background/60 text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset"
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
