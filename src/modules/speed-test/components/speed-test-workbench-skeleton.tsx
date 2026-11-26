import { Skeleton } from "@/components/ui/skeleton";

/**
 * The card while the route loads: the disclosure, the start row and three
 * meters, the results tray holding the plan check, then the history.
 */
export function SpeedTestWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-16 w-full rounded-lg" />

            <div className="flex flex-col gap-3">
                <div className="flex min-h-7 items-center justify-between gap-2">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-8 w-32 rounded-lg" />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-[5.75rem] w-full rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-4 w-56" />
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-36 w-full rounded-lg" />
            </div>

            <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-3.5 w-full max-w-md" />
            </div>
        </div>
    );
}
