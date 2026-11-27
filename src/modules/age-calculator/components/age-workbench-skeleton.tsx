import { Skeleton } from "@/components/ui/skeleton";

/**
 * The card while it waits: the fallback for the request-time half of the page,
 * and the matching block in `loading.tsx`. Mode switch and folded options, the
 * two date fields side by side, the age-limit box, then the result tray.
 */
export function AgeWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-full max-w-md" />
                </div>
                <Skeleton className="h-5 w-24" />
            </div>

            <div className="flex flex-col gap-4">
                <Skeleton className="h-5 w-24" />
                <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-2">
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-11 w-full rounded-xl" />
                            <Skeleton className="h-3.5 w-full max-w-xs" />
                        </div>
                    ))}
                </div>
                <div className="ring-border/70 flex flex-col gap-4 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <Skeleton className="h-4 w-24" />
                    <div className="grid gap-4 sm:grid-cols-2">
                        {Array.from({ length: 2 }, (_, index) => (
                            <div key={index} className="flex flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-24" />
                                <Skeleton className="h-9 w-44 rounded-xl" />
                            </div>
                        ))}
                    </div>
                    <Skeleton className="h-11 w-full rounded-xl" />
                </div>
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-24" />
                <div className="ring-border/70 flex flex-col gap-3 rounded-lg p-3 ring-1 ring-inset sm:p-4">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-8 w-full max-w-md" />
                    <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 3 }, (_, index) => (
                            <Skeleton key={index} className="h-14 w-full rounded-xl" />
                        ))}
                    </div>
                    <Skeleton className="h-4 w-64 max-w-full" />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <Skeleton key={index} className="h-44 w-full rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    );
}
