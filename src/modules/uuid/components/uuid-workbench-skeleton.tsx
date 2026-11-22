import { Skeleton } from "@/components/ui/skeleton";

/**
 * The generator card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function UuidWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-72" />
            </div>

            <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-4/5" />
                </div>
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-9 w-28 rounded-xl" />
                        {Array.from({ length: 6 }, (_, index) => (
                            <Skeleton key={index} className="h-7 w-10 rounded-lg" />
                        ))}
                    </div>
                    <Skeleton className="h-3.5 w-40" />
                </div>
            </div>

            <Skeleton className="h-px w-full rounded-none" />

            <div className="flex flex-wrap gap-2">
                <Skeleton className="h-9 w-32 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
            </div>

            <Skeleton className="h-24 w-full rounded-xl sm:h-28" />
        </div>
    );
}
