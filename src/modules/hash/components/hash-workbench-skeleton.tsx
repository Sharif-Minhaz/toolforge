import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Mode and algorithm with
 * the folded settings on top, then input beside result from `lg` up.
 */
export function HashWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3.5 w-12" />
                        <Skeleton className="h-12 w-full rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-56" />
                    </div>
                </div>
                <Skeleton className="h-5 w-24" />
            </div>

            <div className="flex flex-col gap-5">
                <Skeleton className="h-4 w-full max-w-lg" />

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-7 w-20 rounded-lg" />
                        </div>
                        <Skeleton className="h-40 w-full rounded-xl" />
                        <div className="flex items-start justify-between gap-2">
                            <Skeleton className="h-3 w-56" />
                            <Skeleton className="h-7 w-24 rounded-lg" />
                        </div>
                    </div>

                    <div className="bg-muted/40 ring-border flex min-w-0 flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-5 w-16" />
                            <div className="flex items-center gap-1.5">
                                <Skeleton className="h-7 w-24 rounded-lg" />
                                <Skeleton className="h-7 w-24 rounded-lg" />
                            </div>
                        </div>
                        <Skeleton className="h-32 w-full rounded-lg" />
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3.5 w-full" />
                    </div>
                </div>
            </div>
        </div>
    );
}
