import { Skeleton } from "@/components/ui/skeleton";

/**
 * The key generator card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function RsaWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-full max-w-lg" />
            </div>

            <Skeleton className="h-4 w-full max-w-xl" />

            {/* Key size, container and rendering. */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-40" />
                    </div>
                ))}
            </div>

            {/* Usage and hash. */}
            <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-48" />
                    </div>
                ))}
            </div>

            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />

            <Skeleton className="h-3.5 w-56" />

            <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <div
                        key={index}
                        className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-24" />
                            <div className="flex items-center gap-1.5">
                                <Skeleton className="h-7 w-20 rounded-lg" />
                                <Skeleton className="size-7 rounded-lg" />
                            </div>
                        </div>
                        <Skeleton className="h-32 w-full rounded-lg" />
                    </div>
                ))}
            </div>

            <Skeleton className="h-10 w-full rounded-xl" />
        </div>
    );
}
