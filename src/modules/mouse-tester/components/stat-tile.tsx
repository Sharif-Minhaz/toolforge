import { cn } from "@/lib/utils";

type StatTileProps = {
    label: string;
    value: string;
    /** Lit while the control it counts is held, or just fired. */
    active?: boolean;
    /** Outlined once the count it shows includes a fault. */
    alert?: boolean;
};

/**
 * One counter. The outline is a second channel, never the only one: a faulted
 * control's number also appears in the fault tiles and in the diagnosis, in
 * words.
 */
export function StatTile({ label, value, active = false, alert = false }: StatTileProps) {
    return (
        <div
            className={cn(
                "flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-2 py-2.5 text-center ring-1 ring-inset",
                "transition-[background-color,box-shadow] duration-100",
                active
                    ? "bg-primary/10 ring-primary/50"
                    : alert
                      ? "bg-destructive/5 ring-destructive/40"
                      : "bg-muted/30 ring-border/60",
            )}
        >
            <span className="text-muted-foreground w-full truncate text-[0.625rem] font-semibold tracking-wider uppercase">
                {label}
            </span>
            <span
                className={cn(
                    "font-mono text-lg font-semibold tabular-nums",
                    alert && !active && "text-destructive",
                )}
            >
                {value}
            </span>
        </div>
    );
}
