import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The view and action row,
 * then the editor (1) beside the preview (2), then the document counts.
 */
export function MarkdownWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="xl:max-w-md xl:flex-1">
                    <Skeleton className="h-11 w-full rounded-xl" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Skeleton className="mr-1.5 h-5 w-28 rounded-full" />
                    {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton key={index} className="h-7 w-24 rounded-lg" />
                    ))}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <div className="flex min-h-7 items-center">
                        <Skeleton className="h-5 w-24" />
                    </div>
                    <Skeleton className="h-9 w-full rounded-xl" />
                    <Skeleton className="h-104 w-full rounded-xl" />
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex min-h-7 items-center">
                        <Skeleton className="h-5 w-24" />
                    </div>
                    <Skeleton className="hidden h-9 w-full rounded-xl lg:block" />
                    <Skeleton className="h-104 w-full rounded-xl" />
                </div>
            </div>

            <div className="flex flex-wrap gap-4">
                {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-3 w-20" />
                ))}
            </div>
        </div>
    );
}
