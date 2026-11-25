import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function ImageToTextWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-4 w-96 max-w-full" />
            </div>

            {/* The download disclosure. */}
            <Skeleton className="h-16 w-full rounded-xl" />

            {/* The language picker. */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                    <Skeleton className="h-3 w-56 max-w-full" />
                </div>
            </div>

            {/* Drop zone, paste and link row, status line. */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-9 w-full rounded-xl" />
                <Skeleton className="h-3.5 w-48" />
            </div>
        </div>
    );
}
