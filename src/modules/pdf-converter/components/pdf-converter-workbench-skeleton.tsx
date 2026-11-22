import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function PdfConverterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            {/* Source switch */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-10 w-60 rounded-xl" />
            </div>

            {/* Format switch, then the document box */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-10 w-64 rounded-xl" />
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-7 w-24 rounded-lg" />
                    </div>
                    <Skeleton className="h-44 w-full rounded-xl" />
                </div>
            </div>

            <Skeleton className="h-px w-full rounded-none" />

            {/* Four selects */}
            <div className="flex flex-col gap-4">
                <Skeleton className="h-3.5 w-40" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-8 w-full rounded-lg" />
                        </div>
                    ))}
                </div>

                {/* Six switches */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                    {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-xl" />
                    ))}
                </div>
            </div>

            <Skeleton className="h-px w-full rounded-none" />

            {/* Summary strip and the button */}
            <div className="flex flex-col gap-3">
                <Skeleton className="h-3.5 w-28" />
                <div className="flex gap-1.5">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-6 w-24 rounded-full" />
                    ))}
                </div>
            </div>

            <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
    );
}
