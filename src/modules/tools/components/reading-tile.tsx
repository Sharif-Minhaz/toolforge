/** One measured fact as a `<dt>`/`<dd>` pair; the caller supplies the `<dl>` around the tiles. */
export function ReadingTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-muted/30 ring-border/60 flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-2 py-2.5 text-center ring-1 ring-inset">
            <dt className="text-muted-foreground w-full truncate text-xs font-medium">{label}</dt>
            <dd className="font-mono text-[0.9375rem] font-semibold break-all tabular-nums sm:text-base">
                {value}
            </dd>
        </div>
    );
}
