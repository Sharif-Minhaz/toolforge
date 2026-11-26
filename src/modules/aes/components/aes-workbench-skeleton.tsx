import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of the
 * page, and the matching block in `loading.tsx`. Notice, direction and cipher on
 * top, then the payload with its key beside the result from `lg` up.
 */
export function AesWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-4 w-full max-w-xl" />

            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-7 w-16 rounded-lg" />
                    </div>
                    <Skeleton className="h-12 w-full rounded-xl" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-28" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3 w-48" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                    {/* The payload box. */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-5 w-24" />
                            <div className="flex items-center gap-1.5">
                                <Skeleton className="h-7 w-16 rounded-lg" />
                                <Skeleton className="h-7 w-14 rounded-lg" />
                                <Skeleton className="h-7 w-16 rounded-lg" />
                            </div>
                        </div>
                        <Skeleton className="h-40 w-full rounded-xl" />
                        <Skeleton className="h-3 w-72 max-w-full" />
                    </div>

                    {/* The key, then the folded advanced settings. */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="h-7 w-24 rounded-lg" />
                        </div>
                        <Skeleton className="h-9 w-full rounded-lg" />
                        <Skeleton className="h-3 w-64" />
                    </div>

                    <Skeleton className="h-5 w-36" />
                </div>

                <div className="flex items-center gap-3 lg:flex-col lg:pt-10">
                    <Skeleton className="h-px flex-1 rounded-none lg:h-auto lg:w-px" />
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="h-px flex-1 rounded-none lg:h-auto lg:w-px" />
                </div>

                <div className="bg-muted/40 ring-border flex min-w-0 flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-5 w-24" />
                        <div className="flex items-center gap-1.5">
                            <Skeleton className="h-7 w-16 rounded-lg" />
                            <Skeleton className="h-7 w-24 rounded-lg" />
                            <Skeleton className="h-7 w-28 rounded-lg" />
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
