import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function RegexWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-4 w-80" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-12" />
                <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-32" />
                            <div className="flex gap-1.5">
                                {Array.from({ length: 3 }, (_, index) => (
                                    <Skeleton key={index} className="h-6 w-20 rounded-lg" />
                                ))}
                            </div>
                        </div>
                        <Skeleton className="h-11 w-full rounded-xl" />
                    </div>

                    <Skeleton className="h-3.5 w-56" />

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-20" />
                            <div className="flex gap-1.5">
                                <Skeleton className="h-7 w-16 rounded-lg" />
                                <Skeleton className="h-7 w-24 rounded-lg" />
                            </div>
                        </div>
                        <Skeleton className="h-56 w-full rounded-xl lg:h-72" />
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-48 w-full rounded-xl" />
                </div>
            </div>
        </div>
    );
}
