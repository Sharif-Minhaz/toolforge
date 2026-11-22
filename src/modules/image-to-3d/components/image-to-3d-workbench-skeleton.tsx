import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function ImageTo3dWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            {/* The drop zone, with the buttons and the URL row inside it. */}
            <Skeleton className="h-56 w-full rounded-xl" />

            {/* Eleven boxes: three selects, six measures, and the switch trio. */}
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 10 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-40" />
                    </div>
                ))}
            </div>

            {/* The picture beside the model it becomes. */}
            <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="aspect-4/3 w-full rounded-xl" />
                <Skeleton className="aspect-4/3 w-full rounded-xl" />
            </div>

            <div className="border-border/70 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-5 w-72 max-w-full" />
                    <Skeleton className="h-3 w-96 max-w-full" />
                </div>
                <Skeleton className="h-9 w-44 rounded-xl" />
            </div>
        </div>
    );
}
