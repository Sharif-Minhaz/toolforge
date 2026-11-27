import { Skeleton } from "@/components/ui/skeleton";

/**
 * The lookup card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Description, domain,
 * lookup, status.
 */
export function SubdomainLookupWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-4 w-full max-w-xl" />

            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-3 w-72 max-w-full" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-9 w-40 rounded-xl" />
                <Skeleton className="ml-auto h-6 w-32 rounded-full" />
            </div>

            <Skeleton className="h-4 w-64 max-w-full" />
        </div>
    );
}
