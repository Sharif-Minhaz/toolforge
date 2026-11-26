import { Skeleton } from "@/components/ui/skeleton";

/**
 * The timestamp cards while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The input (1), the epoch
 * values on their tray (2), the folded reading options; then the zone board and
 * the calendar details.
 */
export function TimestampWorkbenchSkeleton() {
    return (
        <div aria-hidden="true" className="flex flex-col gap-6">
            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-7 w-40 rounded-lg" />
                    </div>
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-56" />
                    <div className="mt-1 flex flex-wrap gap-1">
                        {Array.from({ length: 6 }, (_, index) => (
                            <Skeleton key={index} className="h-7 w-24 rounded-lg" />
                        ))}
                    </div>
                </div>

                <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <div className="flex min-h-7 items-center justify-between gap-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-7 w-28 rounded-lg" />
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        {Array.from({ length: 5 }, (_, index) => (
                            <Skeleton key={index} className="h-14 w-full rounded-xl" />
                        ))}
                    </div>
                </div>

                {/* The reading options, folded to their summary line. */}
                <Skeleton className="h-5 w-48" />
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-4 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-64" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-56 w-full rounded-2xl" />
                    ))}
                </div>

                <div className="bg-muted/40 ring-border/60 flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <Skeleton className="h-4 w-48" />
                    <div className="grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: 2 }, (_, index) => (
                            <div key={index} className="flex flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-20" />
                                <Skeleton className="h-9 w-full rounded-xl" />
                            </div>
                        ))}
                    </div>
                    <Skeleton className="h-8 w-28 rounded-xl" />
                    <div className="flex flex-wrap gap-1">
                        {Array.from({ length: 5 }, (_, index) => (
                            <Skeleton key={index} className="h-7 w-24 rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-4 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-72" />
                </div>

                <Skeleton className="h-16 w-full rounded-xl" />

                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 5 }, (_, index) => (
                        <Skeleton key={index} className="h-12 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        </div>
    );
}
