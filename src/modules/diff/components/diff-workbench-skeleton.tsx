import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The folded options, the
 * two boxes with their actions, then the comparison's tray at full width.
 */
export function DiffWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-5 w-24" />

            <div className="flex flex-col gap-3">
                {/* The two input boxes, side by side from the large breakpoint. */}
                <div className="grid gap-4 lg:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-3">
                            <div className="flex min-h-7 items-center justify-between gap-2">
                                <Skeleton className="h-5 w-24" />
                                <div className="flex gap-1">
                                    <Skeleton className="h-8 w-20 rounded-lg" />
                                    <Skeleton className="size-7 rounded-lg" />
                                </div>
                            </div>
                            <Skeleton className="h-40 w-full rounded-xl" />
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <Skeleton className="h-8 w-28 rounded-lg" />
                    <Skeleton className="h-8 w-26 rounded-lg" />
                    <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <div className="flex min-h-7 items-center justify-between gap-2">
                    <Skeleton className="h-5 w-16" />
                    <div className="flex gap-1.5">
                        <Skeleton className="h-8 w-28 rounded-lg" />
                        <Skeleton className="h-8 w-32 rounded-lg" />
                    </div>
                </div>

                <Skeleton className="h-3.5 w-72 max-w-full" />

                <div className="flex items-center justify-between gap-2">
                    {/* The tab strip is sized to its two choices, not the card. */}
                    <Skeleton className="h-8 w-full max-w-56 rounded-lg" />
                    <div className="flex gap-1">
                        <Skeleton className="size-7 rounded-lg" />
                        <Skeleton className="size-7 rounded-lg" />
                    </div>
                </div>

                <div className="bg-card ring-border/70 flex flex-col gap-1 rounded-xl p-2 ring-1 ring-inset">
                    {Array.from({ length: 8 }, (_, index) => (
                        <div
                            key={index}
                            className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem_minmax(0,1fr)] items-center gap-2"
                        >
                            <Skeleton className="h-3.5 w-6 justify-self-end" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-3.5 w-6 justify-self-end" />
                            <Skeleton className="h-4 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
