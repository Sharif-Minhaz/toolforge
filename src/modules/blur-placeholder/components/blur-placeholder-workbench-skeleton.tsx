import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function BlurPlaceholderWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            {/* Encode / decode switch. */}
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-3.5 w-64" />
            </div>

            {/* Five controls: detail across, detail down, ratio, size, punch. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-40" />
                    </div>
                ))}
            </div>

            {/* The picture beside its blur, then the two copyable strings. */}
            <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="aspect-3/2 w-full rounded-xl" />
                <Skeleton className="aspect-3/2 w-full rounded-xl" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
            </div>

            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-3 w-full max-w-lg" />
        </div>
    );
}
