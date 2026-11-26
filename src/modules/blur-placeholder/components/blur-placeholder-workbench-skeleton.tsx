import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The switch and the folded
 * options on top, step 1 over the drop zone, then step 2's tray.
 */
export function BlurPlaceholderWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            {/* Encode / decode switch, then the folded options. */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                </div>
                <Skeleton className="h-5 w-24" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-3.5 w-64" />
            </div>

            {/* The two copyable strings, the picture beside its blur, the snippet. */}
            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Skeleton className="aspect-3/2 w-full rounded-xl" />
                    <Skeleton className="aspect-3/2 w-full rounded-xl" />
                </div>

                <Skeleton className="h-28 w-full rounded-xl" />
            </div>

            <Skeleton className="h-3 w-full max-w-lg" />
        </div>
    );
}
