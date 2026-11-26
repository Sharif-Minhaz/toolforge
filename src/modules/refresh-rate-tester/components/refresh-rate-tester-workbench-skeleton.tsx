import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function RefreshRateTesterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset"
        >
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="min-h-56 w-full rounded-2xl" />
                </div>

                <div className="flex flex-col gap-3 p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-7 w-20 rounded-lg" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: 4 }, (_, index) => (
                            <Skeleton key={index} className="h-24 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>

            <div className="border-border/70 flex flex-col gap-3 border-t p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <Skeleton className="h-5 w-28" />
                    <div className="flex items-end gap-2">
                        <Skeleton className="h-14 w-48 rounded-lg" />
                        <Skeleton className="h-8 w-20 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-28 w-full rounded-2xl" />
                <div className="flex flex-col gap-1">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-3 w-4/5" />
                </div>
            </div>
        </div>
    );
}
