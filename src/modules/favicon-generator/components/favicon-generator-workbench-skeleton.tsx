import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The design fields beside
 * the preview tray from `lg` up, stacked below it.
 */
export function FaviconGeneratorWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 grid gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6 lg:grid-cols-2"
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-16" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3 w-32" />
                        </div>
                    ))}
                </div>
                <Skeleton className="h-14 w-full rounded-xl" />
                <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="h-9 w-full rounded-lg" />
                        </div>
                    ))}
                </div>
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-5 w-24" />
            </div>

            <div className="bg-muted/40 flex flex-col gap-3 rounded-xl p-3 sm:p-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-9 w-36 rounded-lg" />
                <Skeleton className="h-36 w-full rounded-lg" />
            </div>
        </div>
    );
}
