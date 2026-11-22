import { Skeleton } from "@/components/ui/skeleton";

/**
 * The encrypt / decrypt card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function RsaCryptWorkbenchSkeleton() {
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

            {/* Encrypt / Decrypt. */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            {/* Key format and key type, then padding and hash. */}
            {Array.from({ length: 2 }, (_, row) => (
                <div key={row} className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3 w-44" />
                        </div>
                    ))}
                </div>
            ))}

            {/* The key box, then the payload box. */}
            {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="flex flex-col gap-2">
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
            ))}

            <div className="flex justify-center">
                <Skeleton className="size-4 rounded-full" />
            </div>

            <div className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-28" />
                    <div className="flex items-center gap-1.5">
                        <Skeleton className="h-7 w-16 rounded-lg" />
                        <Skeleton className="h-7 w-24 rounded-lg" />
                        <Skeleton className="size-7 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3.5 w-full" />
            </div>
        </div>
    );
}
