import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function KeyboardTesterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset"
        >
            <div className="border-border/70 grid gap-3 border-b p-4 sm:grid-cols-3 sm:p-5">
                {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-8 w-full rounded-lg" />
                    </div>
                ))}
            </div>
            <div className="border-border/70 grid grid-cols-2 gap-2 border-b p-4 sm:grid-cols-4 sm:p-5">
                {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
            </div>
            <div className="flex flex-col gap-3 p-4 sm:p-5">
                <Skeleton className="aspect-[22.5/6.5] w-full rounded-2xl" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-1.5">
                    {Array.from({ length: 10 }, (_, index) => (
                        <Skeleton key={index} className="h-6 w-12 rounded-md" />
                    ))}
                </div>
            </div>
            <div className="border-border/70 grid gap-5 border-t p-4 sm:p-5 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-4 w-3/5" />
                    </div>
                ))}
            </div>
        </div>
    );
}
