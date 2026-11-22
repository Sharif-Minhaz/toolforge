import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function LoremWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>

            <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                    <Skeleton className="h-3 w-4/5" />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-3 w-3/5" />
                </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-2">
                        <Skeleton className="h-3.5 w-24" />
                        <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-9 w-28 rounded-xl" />
                            {Array.from({ length: 6 }, (_, preset) => (
                                <Skeleton key={preset} className="h-7 w-10 rounded-lg" />
                            ))}
                        </div>
                        <Skeleton className="h-3.5 w-40" />
                    </div>
                ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="h-14 w-full rounded-xl" />
                ))}
            </div>

            <Skeleton className="h-px w-full rounded-none" />

            <div className="flex flex-wrap gap-2">
                <Skeleton className="h-9 w-32 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-13 w-full rounded-xl" />
                ))}
            </div>

            <Skeleton className="h-56 w-full rounded-xl" />
        </div>
    );
}
