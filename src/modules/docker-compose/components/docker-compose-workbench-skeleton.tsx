import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of the
 * page, and the matching block in `loading.tsx`. Direction tabs on top, then
 * input beside result from `lg` up.
 */
export function DockerComposeWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-8 w-full max-w-80 rounded-lg" />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 items-center justify-between gap-2">
                        <Skeleton className="h-5 w-36" />
                        <div className="flex gap-1.5">
                            <Skeleton className="h-8 w-32 rounded-lg" />
                            <Skeleton className="size-8 rounded-lg" />
                        </div>
                    </div>
                    <Skeleton className="h-108 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-64 max-w-full" />
                </div>

                <div className="flex items-center gap-3 lg:flex-col lg:pt-10">
                    <Skeleton className="h-px flex-1 rounded-none lg:h-auto lg:w-px" />
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="h-px flex-1 rounded-none lg:h-auto lg:w-px" />
                </div>

                <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <div className="flex min-h-7 items-center justify-between gap-2">
                        <Skeleton className="h-5 w-28" />
                        <div className="flex gap-1.5">
                            <Skeleton className="h-8 w-20 rounded-lg" />
                            <Skeleton className="h-8 w-28 rounded-lg" />
                        </div>
                    </div>
                    <Skeleton className="h-108 w-full rounded-xl" />
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-36" />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-20 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        </div>
    );
}
