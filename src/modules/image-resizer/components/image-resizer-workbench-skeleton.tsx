import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function ImageResizerWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-32 w-full rounded-xl" />
                <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-3.5 w-64 flex-1" />
                    <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-3.5 w-56" />
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                {/* The crop column, with its own action row directly under
                    the picture rather than beneath the whole grid. */}
                <div className="flex flex-col gap-3 self-start">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3.5 w-40" />
                    </div>
                    <Skeleton className="mx-auto h-72 w-full max-w-sm rounded-xl" />
                    {/* The frame opens as a preview, so the crop tool's own
                        Select all / Centre row is not there yet. */}
                    <div className="flex flex-wrap items-center gap-2">
                        <Skeleton className="h-9 w-24 rounded-lg" />
                        <Skeleton className="h-9 w-24 rounded-lg" />
                        <Skeleton className="h-9 w-28 rounded-lg" />
                        <Skeleton className="h-9 w-28 rounded-lg" />
                    </div>
                    <Skeleton className="h-3 w-full max-w-md" />
                    <Skeleton className="h-3 w-3/4 max-w-md" />
                </div>

                <div className="flex flex-col gap-4">
                    {Array.from({ length: 6 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3 w-40" />
                        </div>
                    ))}
                </div>
            </div>

            <Skeleton className="h-3 w-full max-w-lg" />
        </div>
    );
}
