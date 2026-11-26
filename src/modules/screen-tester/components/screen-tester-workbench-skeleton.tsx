import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it loads: the nine swatches and the custom colour, then
 * the key legend and the start button.
 */
export function ScreenTesterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset"
        >
            <div className="flex flex-col gap-3 p-4 sm:p-5">
                <Skeleton className="h-5 w-44" />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Array.from({ length: 9 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-2 p-2">
                            <Skeleton className="aspect-video w-full rounded-lg" />
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-3 w-4/5" />
                        </div>
                    ))}
                </div>
                <div className="flex items-start gap-3 pt-1">
                    <Skeleton className="size-9 rounded-lg" />
                    <div className="flex flex-1 flex-col gap-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-3/5" />
                    </div>
                </div>
            </div>

            <div className="border-border/70 flex flex-col gap-3 border-t p-4 sm:p-5">
                <Skeleton className="h-5 w-36" />
                <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-5 w-48" />
                    ))}
                </div>
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
        </div>
    );
}
