import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The colour (1), then the
 * conversions on their tray with the folded options under them, beside the
 * picker; then matches, contrast, scale, and the palette card.
 */
export function ColorWorkbenchSkeleton() {
    return (
        <div aria-hidden="true" className="flex flex-col gap-6">
            <div className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-24" />
                    <div className="flex flex-wrap items-center gap-2">
                        <Skeleton className="size-10 rounded-xl" />
                        <Skeleton className="h-9 min-w-40 flex-1 rounded-lg" />
                        <Skeleton className="h-8 w-24 rounded-lg" />
                        <Skeleton className="h-8 w-24 rounded-lg" />
                    </div>
                    <Skeleton className="h-3 w-52" />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="flex flex-col gap-4">
                        <div className="bg-muted/40 ring-border flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                            {Array.from({ length: 6 }, (_, index) => (
                                <Skeleton key={index} className="h-12 w-full rounded-xl" />
                            ))}
                        </div>
                        <Skeleton className="h-5 w-24" />
                    </div>

                    <div className="flex flex-col gap-4">
                        <Skeleton className="h-56 w-full rounded-xl sm:h-64" />
                        {Array.from({ length: 2 }, (_, index) => (
                            <div key={index} className="flex flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-20" />
                                <Skeleton className="h-4 w-full rounded-full" />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-xl" />
                    ))}
                </div>

                <div className="flex flex-col gap-3">
                    <Skeleton className="h-5 w-40" />
                    <div className="grid gap-2 sm:grid-cols-2">
                        {Array.from({ length: 2 }, (_, index) => (
                            <Skeleton key={index} className="h-20 w-full rounded-xl" />
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <Skeleton className="h-5 w-48" />
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                        {Array.from({ length: 11 }, (_, index) => (
                            <Skeleton key={index} className="h-16 w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-4 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-8 w-56 rounded-lg" />
                <div className="flex flex-col gap-1.5">
                    {Array.from({ length: 8 }, (_, index) => (
                        <Skeleton key={index} className="h-8 w-full rounded-md" />
                    ))}
                </div>
            </div>
        </div>
    );
}
