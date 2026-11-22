import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function AesWorkbenchSkeleton() {
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

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-48" />
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-7 w-24 rounded-lg" />
                </div>
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-3 w-64" />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <div className="flex items-center gap-1.5">
                        <Skeleton className="h-7 w-16 rounded-lg" />
                        <Skeleton className="h-7 w-14 rounded-lg" />
                        <Skeleton className="h-7 w-16 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-3 w-72 max-w-full" />
            </div>

            <Skeleton className="h-11 w-full rounded-xl" />

            <div className="flex items-center gap-3">
                <Skeleton className="h-px flex-1" />
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-px flex-1" />
            </div>

            <div className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <div className="flex items-center gap-1.5">
                        <Skeleton className="h-7 w-16 rounded-lg" />
                        <Skeleton className="h-7 w-24 rounded-lg" />
                        <Skeleton className="h-7 w-14 rounded-lg" />
                        <Skeleton className="size-7 rounded-lg" />
                    </div>
                </div>
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
                <Skeleton className="h-3.5 w-full" />
            </div>
        </div>
    );
}
