import { Skeleton } from "@/components/ui/skeleton";

/**
 * The card while the route loads: the stage — figure, link and start
 * button — three meters, the results tray holding the plan check,
 * then the history.
 */
export function SpeedTestWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <div className="flex min-h-7 items-center">
                    <Skeleton className="h-5 w-28" />
                </div>
                <div className="bg-muted/40 ring-border/70 flex flex-col items-center gap-6 rounded-2xl p-4 ring-1 ring-inset sm:p-6">
                    <div className="flex flex-col items-center gap-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-15 w-48 sm:h-18" />
                    </div>
                    <div className="flex w-full flex-col gap-1.5">
                        <div className="flex h-24 items-center justify-between gap-3">
                            <Skeleton className="size-11 rounded-full" />
                            <Skeleton className="h-px flex-1" />
                            <Skeleton className="size-11 rounded-full" />
                        </div>
                        <div className="flex justify-between">
                            <Skeleton className="h-3.5 w-10" />
                            <Skeleton className="h-3.5 w-24" />
                        </div>
                    </div>
                    <Skeleton className="h-9 w-36 rounded-lg" />
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
