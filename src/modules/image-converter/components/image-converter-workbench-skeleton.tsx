import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Target and the folded
 * settings on top, step 1 over the drop zone, then the Convert press.
 */
export function ImageConverterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-40" />
                    </div>
                </div>
                <Skeleton className="h-5 w-24" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-52 w-full rounded-xl" />
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-3.5 w-64" />
            </div>

            <Skeleton className="h-10 w-28 rounded-lg" />

            <Skeleton className="h-3 w-full max-w-lg" />
        </div>
    );
}
