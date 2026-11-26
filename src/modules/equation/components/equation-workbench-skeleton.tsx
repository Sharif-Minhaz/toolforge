import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The source switch, step 1
 * with its Convert press, then step 2's tray.
 */
export function EquationWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            {/* The Text / Image switch, then whichever panel it selects.
                Text is the mode the page opens on. */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-10 w-40 rounded-xl" />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="size-7 rounded-lg" />
                </div>
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-9 w-40 rounded-xl" />
                <Skeleton className="h-3.5 w-56" />
            </div>

            {/* Source and preview sit side by side from the large breakpoint,
                inside the result's tray, then the folded options and the
                buttons — exactly what the workbench renders. */}
            <div className="bg-muted/40 ring-border flex flex-col gap-4 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <div className="grid gap-4 lg:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-32 w-full rounded-xl" />
                            <Skeleton className="h-3.5 w-24" />
                        </div>
                    ))}
                </div>

                <Skeleton className="h-5 w-24" />

                <div className="flex flex-wrap gap-1.5">
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <Skeleton className="h-8 w-24 rounded-lg" />
                    <Skeleton className="h-8 w-28 rounded-lg" />
                </div>
            </div>
        </div>
    );
}
