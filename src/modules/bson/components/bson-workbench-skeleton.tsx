import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function BsonWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            {/* Read as / Write as. */}
            <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <div className="flex gap-1.5">
                        <Skeleton className="h-8 w-32 rounded-lg" />
                        <Skeleton className="h-8 w-28 rounded-lg" />
                        <Skeleton className="size-8 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>

            <div className="flex flex-col gap-4">
                <Skeleton className="h-3.5 w-28" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 5 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3 w-3/4" />
                        </div>
                    ))}
                </div>
                <Skeleton className="h-14 w-full rounded-xl" />
            </div>

            <Skeleton className="mx-auto size-8 rounded-full" />

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <div className="flex gap-1.5">
                        <Skeleton className="h-8 w-20 rounded-lg" />
                        <Skeleton className="h-8 w-28 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-3 w-72 max-w-full" />
            </div>

            <div className="flex flex-col gap-1.5">
                {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="h-14 w-full rounded-xl" />
                ))}
            </div>
        </div>
    );
}
