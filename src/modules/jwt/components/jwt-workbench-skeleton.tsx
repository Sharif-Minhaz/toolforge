import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Mode, then the token and
 * its verification key beside the decoded result from `lg` up.
 */
export function JwtWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex max-w-md flex-col gap-2">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Skeleton className="h-4 w-72 max-w-full" />
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-32 rounded-lg" />
                        <Skeleton className="h-8 w-24 rounded-lg" />
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-5">
                        <div className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                            <div className="flex items-center justify-between gap-2">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-7 w-16 rounded-lg" />
                            </div>
                            <Skeleton className="h-36 w-full rounded-lg" />
                            <div className="flex gap-1.5">
                                {Array.from({ length: 3 }, (_, index) => (
                                    <Skeleton key={index} className="h-6 w-24 rounded-lg" />
                                ))}
                            </div>
                            <Skeleton className="h-3.5 w-32" />
                        </div>

                        {/* Signature verification: algorithm, key, verdict. */}
                        <div className="flex flex-col gap-3">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-9 w-full rounded-lg sm:w-44" />
                            <div className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                                <Skeleton className="h-3.5 w-20" />
                                <Skeleton className="h-16 w-full rounded-lg" />
                                <Skeleton className="h-3.5 w-40" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-muted/40 ring-border flex min-w-0 flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-7 w-40 rounded-lg" />
                        </div>

                        {Array.from({ length: 2 }, (_, index) => (
                            <div
                                key={index}
                                className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <Skeleton className="h-3.5 w-36" />
                                    <Skeleton className="size-7 rounded-lg" />
                                </div>
                                <Skeleton className="h-28 w-full rounded-lg" />
                            </div>
                        ))}

                        <Skeleton className="h-px w-full rounded-none" />

                        {/* What to know about this token. */}
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-14 w-full rounded-xl" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
