type ReadingTileProps = {
    label: string;
    value: string;
    hint: string;
};

export function ReadingTile({ label, value, hint }: ReadingTileProps) {
    return (
        <div className="bg-muted/30 ring-border/60 flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5 ring-1 ring-inset">
            <span className="text-muted-foreground text-xs font-medium">{label}</span>
            <span className="font-mono text-xl font-semibold tabular-nums">{value}</span>
            <span className="text-muted-foreground text-[0.6875rem] leading-normal">{hint}</span>
        </div>
    );
}
