import { Skeleton } from "@/components/ui/skeleton";

/**
 * The editor shell while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function HexEditorWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset"
        >
            {/* The toolbar: twelve icon buttons, a copy menu, the column
                pair and the two view toggles. */}
            <div className="border-border/70 flex items-center gap-1 border-b px-2 py-1.5">
                {Array.from({ length: 12 }, (_, index) => (
                    <Skeleton key={index} className="size-8 rounded-lg" />
                ))}
                <Skeleton className="ml-auto h-6 w-32 rounded-lg" />
            </div>

            <div className="flex h-[26rem] flex-col lg:grid lg:h-[34rem] lg:grid-cols-[260px_0.375rem_minmax(0,1fr)]">
                {/* The inspector: a heading, the endianness select, and its rows. */}
                <div className="border-border/70 order-2 flex max-h-56 flex-col gap-2 overflow-hidden border-t p-3 lg:order-1 lg:max-h-none lg:border-t-0 lg:border-r">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                    {Array.from({ length: 12 }, (_, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-3 flex-1" />
                        </div>
                    ))}
                </div>

                <div className="bg-border/40 order-1 hidden lg:order-2 lg:block" />

                {/* The grid: a sticky header row and sixteen byte rows. */}
                <div className="order-1 flex min-w-0 flex-col gap-1 p-2 lg:order-3">
                    <Skeleton className="h-5 w-full" />
                    {Array.from({ length: 16 }, (_, index) => (
                        <Skeleton key={index} className="h-4 w-full" />
                    ))}
                </div>
            </div>

            <div className="border-border/70 flex h-8 items-center gap-4 border-t px-3">
                {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-3 w-16" />
                ))}
            </div>
        </div>
    );
}
