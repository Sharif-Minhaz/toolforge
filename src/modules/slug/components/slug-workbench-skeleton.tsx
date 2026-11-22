import { Skeleton } from "@/components/ui/skeleton";

/**
 * The slug card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function SlugWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="size-7 rounded-lg" />
                </div>
                <Skeleton className="h-28 w-full rounded-xl" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-20" />
                {/* The separator group is sized to its five choices, not
                    stretched across the card. */}
                <Skeleton className="h-11 w-full max-w-76 rounded-xl" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-14 w-full rounded-xl" />
                ))}
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-24" />
                <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-9 w-28 rounded-xl" />
                    <Skeleton className="h-7 w-10 rounded-lg" />
                    <Skeleton className="h-7 w-10 rounded-lg" />
                    <Skeleton className="h-7 w-10 rounded-lg" />
                    <Skeleton className="h-7 w-10 rounded-lg" />
                </div>
                <Skeleton className="h-3.5 w-64" />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <div className="flex gap-1.5">
                        <Skeleton className="h-7 w-20 rounded-lg" />
                        <Skeleton className="h-7 w-24 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-3.5 w-52" />
            </div>
        </div>
    );
}
