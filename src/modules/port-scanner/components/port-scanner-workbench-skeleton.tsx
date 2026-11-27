import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Host, challenge,
 * the scan, then the folded port options.
 */
export function PortScannerWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-8 w-36 rounded-lg" />
                </div>
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-3 w-48" />
            </div>

            {/* Turnstile draws at a fixed size. */}
            <Skeleton className="h-16 w-full max-w-75 rounded-xl" />

            <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-9 w-36 rounded-xl" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-6 w-32 rounded-full" />
            </div>

            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-5 w-24" />
        </div>
    );
}
