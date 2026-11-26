import { Skeleton } from "@/components/ui/skeleton";

/**
 * The generator card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Version and quantity on
 * top, then the result tray with its actions.
 */
export function UuidWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-4/5" />
                </div>
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-9 w-28 rounded-xl" />
                        {Array.from({ length: 6 }, (_, index) => (
                            <Skeleton key={index} className="h-7 w-10 rounded-lg" />
                        ))}
                    </div>
                    <Skeleton className="h-3.5 w-40" />
                </div>
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-36" />
                <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-9 w-32 rounded-lg" />
                    <Skeleton className="h-9 w-28 rounded-lg" />
                    <Skeleton className="h-9 w-32 rounded-lg" />
                </div>
                <Skeleton className="h-24 w-full rounded-xl sm:h-28" />
            </div>
        </div>
    );
}
