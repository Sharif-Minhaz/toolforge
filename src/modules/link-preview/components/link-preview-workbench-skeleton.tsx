import { Skeleton } from "@/components/ui/skeleton";

/**
 * The check card while it waits: the fallback for the request-time half of the
 * page, and the matching block in `loading.tsx`. Description, mode switch,
 * address, button, status — in the fetch mode's order, which is
 * the one a link opens on unless it says otherwise.
 */
export function LinkPreviewWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-4 w-full max-w-xl" />

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-9 w-72 max-w-full rounded-full" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-3 w-80 max-w-full" />
            </div>

            <Skeleton className="h-9 w-40 rounded-xl" />

            <Skeleton className="h-4 w-64 max-w-full" />
        </div>
    );
}
