import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The folded quality
 * option on top, then step 1's label over the drop zone.
 */
export function BackgroundRemoverWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-5 w-24" />

            {/* Step label, drop zone, then the paste row underneath it. */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-36 w-full rounded-xl" />
                <Skeleton className="h-8 w-full rounded-lg" />
            </div>

            {/* Picture on the left, background picker on the right. */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex flex-col gap-3">
                    {/* The picture card, its verdict line, and the two buttons. */}
                    <div className="ring-border/70 flex flex-col gap-2 rounded-2xl p-3 ring-1 ring-inset sm:p-4">
                        <Skeleton className="mx-auto aspect-3/2 w-full rounded-lg" />
                    </div>
                    <Skeleton className="h-3 w-64" />
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-40 rounded-xl" />
                        <Skeleton className="h-9 w-28 rounded-xl" />
                    </div>
                </div>

                {/* The three-tab background picker, tabs then a scrolling grid. */}
                <div className="ring-border/70 flex flex-col gap-3 rounded-2xl p-3 ring-1 ring-inset sm:p-4">
                    <Skeleton className="h-8 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                    <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 9 }, (_, index) => (
                            <Skeleton key={index} className="aspect-[4/3] w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>

            {/* The strip, centred under both columns. */}
            <div className="flex justify-center gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="size-16 shrink-0 rounded-xl" />
                ))}
            </div>

            <Skeleton className="h-3 w-full max-w-lg" />
        </div>
    );
}
