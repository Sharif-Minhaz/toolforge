import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function CronWorkbenchSkeleton() {
    return (
        <div aria-hidden="true" className="flex flex-col gap-6">
            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-4 w-72" />
                </div>

                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-56" />
                </div>

                <Skeleton className="h-16 w-full rounded-xl" />

                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {Array.from({ length: 5 }, (_, index) => (
                        <Skeleton key={index} className="h-20 w-full rounded-xl" />
                    ))}
                </div>

                <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 8 }, (_, index) => (
                        <Skeleton key={index} className="h-7 w-24 rounded-lg" />
                    ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: 2 }, (_, index) => (
                            <div key={index} className="flex flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-20" />
                                <Skeleton className="h-9 w-full rounded-xl" />
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-9 w-64 rounded-xl" />
                    <Skeleton className="h-3.5 w-48" />
                </div>
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-4 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-64" />
                </div>

                <div className="flex flex-col gap-1.5">
                    {Array.from({ length: 5 }, (_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-xl" />
                    ))}
                </div>

                <Skeleton className="h-8 w-36 rounded-xl" />
            </div>
        </div>
    );
}
