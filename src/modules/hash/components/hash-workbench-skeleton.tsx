import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function HashWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-full max-w-lg" />
            </div>

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

            <div className="flex flex-col gap-3">
                <Skeleton className="h-3.5 w-16" />
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-9 w-full rounded-xl sm:w-40" />
                        <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-16 w-full rounded-xl" />
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2 xl:gap-6">
                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-7 w-20 rounded-lg" />
                    </div>
                    <Skeleton className="h-40 w-full rounded-xl" />
                    <div className="flex items-start justify-between gap-2">
                        <Skeleton className="h-3 w-56" />
                        <Skeleton className="h-7 w-24 rounded-lg" />
                    </div>
                </div>

                <div className="ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-3.5 w-12" />
                        <div className="flex items-center gap-1.5">
                            <Skeleton className="h-7 w-24 rounded-lg" />
                            <Skeleton className="size-7 rounded-lg" />
                        </div>
                    </div>
                    <Skeleton className="h-32 w-full rounded-lg" />
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3.5 w-full" />
                </div>
            </div>
        </div>
    );
}
