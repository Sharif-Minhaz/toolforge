import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The folded options on top,
 * step 1 over the drop zone and the Generate button, step 2's empty model, then
 * the download tray.
 */
export function ImageTo3dWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-5 w-24" />

            {/* Step label, the drop zone with the buttons and the URL row, the
                challenge, the Generate button and the status line. */}
            <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-44 w-full rounded-xl" />
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-16 w-full max-w-82 rounded-lg" />
                <Skeleton className="h-9 w-44 rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
            </div>

            {/* Step 2: the model and its parts. */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-36 w-full rounded-xl" />
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:flex-row sm:items-end sm:justify-between sm:p-4">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-72 max-w-full" />
                    <Skeleton className="h-3 w-96 max-w-full" />
                </div>
                <Skeleton className="h-9 w-44 rounded-xl" />
            </div>
        </div>
    );
}
