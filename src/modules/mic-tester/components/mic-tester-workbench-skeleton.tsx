import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function MicTesterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset"
        >
            <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-40 w-full rounded-2xl sm:h-48" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-full rounded-full" />
                    <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: 2 }, (_, index) => (
                            <Skeleton key={index} className="h-16 w-full rounded-xl" />
                        ))}
                    </div>
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-9 w-44 rounded-lg" />
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3.5 w-4/5" />
                    </div>
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-xl" />
                    ))}
                </div>

                <div className="flex flex-col gap-4 p-4 sm:p-5">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-9 w-36 rounded-lg" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                </div>
            </div>
        </div>
    );
}
