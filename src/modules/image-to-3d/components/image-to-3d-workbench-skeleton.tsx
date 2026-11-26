import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The folded options on top,
 * step 1 over the drop zone, the picture beside its model, then step 2's tray.
 */
export function ImageTo3dWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-5 w-24" />

            {/* Step label, then the drop zone with the buttons and the URL row. */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-56 w-full rounded-xl" />
            </div>

            {/* The picture beside the model it becomes. */}
            <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="aspect-4/3 w-full rounded-xl" />
                <Skeleton className="aspect-4/3 w-full rounded-xl" />
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:flex-row sm:items-end sm:justify-between sm:p-4">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-5 w-72 max-w-full" />
                    <Skeleton className="h-3 w-96 max-w-full" />
                </div>
                <Skeleton className="h-9 w-44 rounded-xl" />
            </div>
        </div>
    );
}
