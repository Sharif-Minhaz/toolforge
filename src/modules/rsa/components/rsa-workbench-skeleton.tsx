import { Skeleton } from "@/components/ui/skeleton";

/**
 * The key generator card while it waits: the fallback for the request-time half
 * of the page, and the matching block in `loading.tsx`. Notice and Reset, the
 * key's shape with the folded advanced settings, the press, then the key pair.
 */
export function RsaWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-4 w-full max-w-xl" />
                <Skeleton className="h-7 w-20 shrink-0 rounded-lg" />
            </div>

            <div className="flex flex-col gap-4">
                {/* Key size. */}
                <div className="flex flex-col gap-1.5 sm:max-w-xs">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                    <Skeleton className="h-3 w-40" />
                </div>

                {/* Usage and rendering. */}
                <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3 w-48" />
                        </div>
                    ))}
                </div>

                <Skeleton className="h-5 w-36" />
            </div>

            <Skeleton className="h-11 w-full rounded-xl" />

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-24" />
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
                <Skeleton className="h-3 w-64 max-w-full" />
            </div>
        </div>
    );
}
