import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function WebcamTesterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset"
        >
            <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="aspect-video w-full rounded-2xl" />
                    <Skeleton className="h-9 w-36 rounded-lg" />
                    <div className="grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: 2 }, (_, index) => (
                            <div key={index} className="flex flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-24" />
                                <Skeleton className="h-9 w-full rounded-lg" />
                            </div>
                        ))}
                    </div>
                    <Skeleton className="h-16 w-full rounded-xl" />
                </div>

                <div className="flex flex-col gap-4 p-4 sm:p-5">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                </div>
            </div>
        </div>
    );
}
