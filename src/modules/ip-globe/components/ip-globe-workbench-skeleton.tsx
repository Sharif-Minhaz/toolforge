import { Skeleton } from "@/components/ui/skeleton";

/**
 * The form card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function IpGlobeWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-96 max-w-full" />
            </div>

            {/* Mode and resolver, side by side above the box. */}
            <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-48" />
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-3 w-28" />
            </div>

            {/* The three switches. */}
            <div className="grid gap-2 sm:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
            </div>

            <Skeleton className="h-9 w-40 rounded-xl" />
            <Skeleton className="h-4 w-64 max-w-full" />
        </div>
    );
}
