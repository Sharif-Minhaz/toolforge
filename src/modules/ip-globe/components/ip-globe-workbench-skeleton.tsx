import { Skeleton } from "@/components/ui/skeleton";

/**
 * The form card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Note, mode, the box, the
 * run, then the folded options.
 */
export function IpGlobeWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-4 w-full max-w-xl" />

            {/* Mode, half width above the box. */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                    <Skeleton className="h-3 w-48" />
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-3 w-28" />
            </div>

            <Skeleton className="h-9 w-40 rounded-xl" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-5 w-24" />
        </div>
    );
}
