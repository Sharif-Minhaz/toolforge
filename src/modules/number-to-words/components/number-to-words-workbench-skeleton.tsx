import { Skeleton } from "@/components/ui/skeleton";

/**
 * The card while it waits: the fallback for the request-time half of the page,
 * and the matching block in `loading.tsx`. Format switch and folded options,
 * the number field, then the two readings side by side from `lg` up.
 */
export function NumberToWordsWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-full max-w-md" />
                </div>
                <Skeleton className="h-5 w-24" />
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex min-h-7 items-center justify-between gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="size-7 rounded-lg" />
                </div>
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-3.5 w-full max-w-sm" />
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-24" />
                <div className="grid gap-3 lg:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div
                            key={index}
                            className="ring-border/70 flex flex-col gap-2 rounded-lg p-3 ring-1 ring-inset sm:p-4"
                        >
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-3.5 w-14" />
                                <Skeleton className="size-7 rounded-lg" />
                            </div>
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-3.5 w-28" />
                        </div>
                    ))}
                </div>
                <Skeleton className="h-3.5 w-52" />
            </div>
        </div>
    );
}
