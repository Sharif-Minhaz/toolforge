import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while prices are read: the fallback for the request-time half
 * of the page, and the matching block in `loading.tsx`. Three selects and the
 * folded rules, then the form beside the result.
 */
export function ZakatWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset"
        >
            <div className="border-border/70 flex flex-col gap-4 border-b p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-9 w-full rounded-lg" />
                            <Skeleton className="h-3 w-4/5" />
                        </div>
                    ))}
                </div>
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-full max-w-2xl" />
            </div>
            <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="border-border/70 flex flex-col gap-6 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    <Skeleton className="h-5 w-48" />
                    {/* Prices, then the money sections. */}
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-36 w-full rounded-lg" />
                    </div>
                    {Array.from({ length: 3 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-3">
                            <Skeleton className="h-4 w-36" />
                            <Skeleton className="h-3 w-2/3" />
                            <div className="grid gap-3 sm:grid-cols-2">
                                {Array.from({ length: 4 }, (_, field) => (
                                    <div key={field} className="flex flex-col gap-1.5">
                                        <Skeleton className="h-3 w-24" />
                                        <Skeleton className="h-9 w-full rounded-lg" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-3 p-4 sm:p-5">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                </div>
            </div>
        </div>
    );
}
