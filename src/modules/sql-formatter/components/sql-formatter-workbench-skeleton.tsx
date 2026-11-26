import { Skeleton } from "@/components/ui/skeleton";

/**
 * The formatter card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Dialect and the folded
 * options on top, then input beside result from `lg` up.
 */
export function SqlFormatterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 sm:max-w-xs">
                    <Skeleton className="h-3.5 w-14" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                </div>
                <Skeleton className="h-5 w-24" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 items-center justify-between gap-2">
                        <Skeleton className="h-5 w-20" />
                        <div className="flex gap-1.5">
                            <Skeleton className="h-7 w-24 rounded-lg" />
                            <Skeleton className="size-7 rounded-lg" />
                        </div>
                    </div>
                    <Skeleton className="h-44 w-full rounded-xl" />
                </div>

                <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <div className="flex min-h-7 items-center justify-between gap-2">
                        <Skeleton className="h-5 w-28" />
                        <div className="flex gap-1.5">
                            <Skeleton className="h-7 w-20 rounded-lg" />
                            <Skeleton className="h-7 w-24 rounded-lg" />
                        </div>
                    </div>
                    <Skeleton className="h-44 w-full rounded-lg" />
                </div>
            </div>
        </div>
    );
}
