import { Skeleton } from "@/components/ui/skeleton";

/**
 * The calculator while it waits: the fallback for the request-time half of the
 * page, and the matching block in `loading.tsx`. Presets, the two fields beside
 * the grid, then the result tray.
 */
export function ChmodWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton key={index} className="h-8 w-12 rounded-lg" />
                    ))}
                </div>
                <Skeleton className="h-4 w-72 max-w-full" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="flex flex-col gap-4">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-7 w-20" />
                            <Skeleton className="h-11 w-full rounded-xl" />
                            <Skeleton className="h-3.5 w-56 max-w-full" />
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <Skeleton className="h-8 w-full" />
                        {Array.from({ length: 3 }, (_, index) => (
                            <Skeleton key={index} className="h-10 w-full rounded-lg" />
                        ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                        {Array.from({ length: 3 }, (_, index) => (
                            <Skeleton key={index} className="h-16 w-full rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-7 w-24" />
                    <Skeleton className="h-8 w-32 rounded-lg" />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <div className="flex flex-col gap-1.5">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div
                            key={index}
                            className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
                        >
                            <Skeleton className="h-3.5 w-16 justify-self-end" />
                            <Skeleton className="h-9 w-full rounded-lg" />
                            <Skeleton className="size-7 rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
