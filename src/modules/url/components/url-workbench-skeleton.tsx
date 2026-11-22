import { Skeleton } from "@/components/ui/skeleton";

/**
 * The encoder card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function UrlWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-4 w-72" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-14" />
                    <div className="flex gap-1.5">
                        <Skeleton className="h-7 w-24 rounded-lg" />
                        <Skeleton className="size-7 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-32 w-full rounded-xl" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-8 w-full rounded-lg" />
                    </div>
                ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-14 w-full rounded-xl" />
                ))}
            </div>

            <div className="flex items-center gap-3">
                <Skeleton className="h-px flex-1 rounded-none" />
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-px flex-1 rounded-none" />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <div className="flex gap-1.5">
                        <Skeleton className="h-7 w-20 rounded-lg" />
                        <Skeleton className="h-7 w-24 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-32 w-full rounded-xl" />
            </div>
        </div>
    );
}
