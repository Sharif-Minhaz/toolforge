import { Skeleton } from "@/components/ui/skeleton";

/**
 * The encrypt / decrypt card while it waits: the fallback for the request-time
 * half of the page, and the matching block in `loading.tsx`. Notice and
 * direction on top, then the payload with its key beside the result from `lg`
 * up.
 */
export function RsaCryptWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-4 w-full max-w-xl" />

            {/* Encrypt / Decrypt, and Reset. */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-7 w-20 rounded-lg" />
                </div>
                <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                    {/* The payload box. */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-5 w-24" />
                            <div className="flex items-center gap-1.5">
                                <Skeleton className="h-7 w-16 rounded-lg" />
                                <Skeleton className="h-7 w-24 rounded-lg" />
                                <Skeleton className="h-7 w-14 rounded-lg" />
                            </div>
                        </div>
                        <Skeleton className="h-32 w-full rounded-xl" />
                        <Skeleton className="h-3 w-72 max-w-full" />
                    </div>

                    {/* Key format and key type. */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        {Array.from({ length: 2 }, (_, index) => (
                            <div key={index} className="flex flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-24" />
                                <Skeleton className="h-9 w-full rounded-xl" />
                                <Skeleton className="h-3 w-44" />
                            </div>
                        ))}
                    </div>

                    {/* The key box, then the folded padding and hash. */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-24" />
                            <div className="flex items-center gap-1.5">
                                <Skeleton className="h-7 w-16 rounded-lg" />
                                <Skeleton className="h-7 w-24 rounded-lg" />
                                <Skeleton className="h-7 w-14 rounded-lg" />
                            </div>
                        </div>
                        <Skeleton className="h-32 w-full rounded-xl" />
                        <Skeleton className="h-3 w-72 max-w-full" />
                    </div>

                    <Skeleton className="h-5 w-24" />
                </div>

                <div className="flex items-center gap-3 lg:flex-col lg:pt-10">
                    <Skeleton className="h-px flex-1 rounded-none lg:h-auto lg:w-px" />
                    <Skeleton className="size-4 rounded-full" />
                    <Skeleton className="h-px flex-1 rounded-none lg:h-auto lg:w-px" />
                </div>

                <div className="bg-muted/40 ring-border flex min-w-0 flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-5 w-28" />
                        <div className="flex items-center gap-1.5">
                            <Skeleton className="h-7 w-16 rounded-lg" />
                            <Skeleton className="h-7 w-24 rounded-lg" />
                            <Skeleton className="h-7 w-32 rounded-lg" />
                        </div>
                    </div>
                    <Skeleton className="h-28 w-full rounded-lg" />
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3.5 w-full" />
                </div>
            </div>
        </div>
    );
}
