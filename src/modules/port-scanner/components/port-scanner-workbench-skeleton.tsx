import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function PortScannerWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            {/* The disclosure panel, which is always painted. */}
            <Skeleton className="h-24 w-full rounded-xl" />

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-8 w-36 rounded-lg" />
                </div>
                <Skeleton className="h-9 w-full rounded-xl" />
                <Skeleton className="h-3 w-48" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton
                            className={
                                index === 0 ? "h-9 w-full rounded-xl" : "h-16 w-full rounded-xl"
                            }
                        />
                        <Skeleton className="h-3 w-3/4" />
                    </div>
                ))}
            </div>

            {/* Turnstile draws at a fixed size. */}
            <Skeleton className="h-16 w-full max-w-75 rounded-xl" />

            <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-9 w-36 rounded-xl" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-6 w-32 rounded-full" />
            </div>

            <Skeleton className="h-4 w-64 max-w-full" />
        </div>
    );
}
