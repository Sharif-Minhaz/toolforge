import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function MouseTesterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset"
        >
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    {/* The step label over the capture area. */}
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="min-h-80 w-full rounded-2xl sm:min-h-96" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                </div>

                <div className="flex flex-col gap-4 p-4 sm:p-5">
                    <Skeleton className="h-3 w-28" />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {Array.from({ length: 12 }, (_, index) => (
                            <Skeleton key={index} className="h-16 rounded-xl" />
                        ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <Skeleton className="h-20 rounded-xl" />
                        <Skeleton className="h-20 rounded-xl" />
                    </div>
                    <Skeleton className="h-20 w-full rounded-xl" />
                    {/* The folded options: only their summary shows. */}
                    <Skeleton className="h-5 w-24" />
                </div>
            </div>

            <div className="border-border/70 grid gap-4 border-t p-4 sm:p-5 lg:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-60 w-full rounded-xl" />
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-24" />
                        <div className="flex gap-1.5">
                            <Skeleton className="h-7 w-20 rounded-lg" />
                            <Skeleton className="h-7 w-20 rounded-lg" />
                        </div>
                    </div>
                    <Skeleton className="h-72 w-full rounded-xl" />
                </div>
            </div>
        </div>
    );
}
