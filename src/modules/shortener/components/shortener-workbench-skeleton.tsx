import { Skeleton } from "@/components/ui/skeleton";

/**
 * The create and recent-links cards while they wait: the fallback for the
 * request-time half of the page, and the matching block in `loading.tsx`.
 */
export function ShortenerWorkbenchSkeleton() {
    return (
        <div aria-hidden="true" className="flex flex-col gap-6">
            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-72" />
                </div>

                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-20" />
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Skeleton className="h-9 min-w-0 flex-1 rounded-xl" />
                        <Skeleton className="h-9 w-full rounded-xl sm:w-36" />
                    </div>
                    <Skeleton className="h-3 w-64" />
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-xl" />
                    ))}
                </div>

                <Skeleton className="h-16 w-full max-w-82 rounded-xl" />
                <Skeleton className="h-3.5 w-56" />
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-4 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-18 w-full rounded-xl" />
            </div>
        </div>
    );
}
