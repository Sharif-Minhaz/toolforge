import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function EquationWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-72 max-w-full" />
            </div>

            {/* The Text / Image switch, then whichever panel it selects.
                Text is the mode the page opens on. */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-10 w-40 rounded-xl" />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="size-7 rounded-lg" />
                </div>
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-9 w-40 rounded-xl" />
                <Skeleton className="h-3.5 w-56" />
            </div>

            {/* Source and preview sit side by side from the large breakpoint,
                which is exactly what the workbench renders. */}
            <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-2">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-32 w-full rounded-xl" />
                        <Skeleton className="h-3.5 w-24" />
                    </div>
                ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
        </div>
    );
}
