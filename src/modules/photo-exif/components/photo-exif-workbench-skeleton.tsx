import { Skeleton } from "@/components/ui/skeleton";

/**
 * The card while the route loads: the matching block in `loading.tsx`. The
 * drop zone, the empty findings tray, then the two keep switches and the
 * button.
 */
export function PhotoExifWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-[7.75rem] w-full rounded-xl" />
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3.5 w-56" />
            </div>

            <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-40" />
                <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-8 w-40 rounded-lg" />
            </div>
        </div>
    );
}
