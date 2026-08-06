import { Skeleton } from "@/components/ui/skeleton";

/**
 * Matches `page.tsx` block for block: header, badge row, the create/import card,
 * the workspace grid, the disclosure panel, then the article with its table of
 * contents. A skeleton that does not agree with what replaces it reads as a
 * layout shift rather than as loading — which is why this file changes whenever
 * that page reorders.
 *
 * The recovery-key panel has no skeleton: it only ever appears in response to a
 * press, never on first paint.
 */
export default function MockStudioLoading() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-full max-w-md" />
                <Skeleton className="h-4 w-full max-w-2xl" />
                <Skeleton className="h-4 w-full max-w-lg" />
                <div className="mt-1 flex flex-wrap gap-2">
                    <Skeleton className="h-6 w-28 rounded-lg" />
                    <Skeleton className="h-6 w-32 rounded-lg" />
                    <Skeleton className="h-6 w-24 rounded-lg" />
                </div>
            </div>

            <div className="flex flex-col gap-6">
                <Skeleton className="h-64 w-full rounded-2xl" />

                <div>
                    <Skeleton className="h-3 w-32" />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Skeleton className="h-36 rounded-2xl" />
                        <Skeleton className="h-36 rounded-2xl" />
                    </div>
                </div>
            </div>

            <Skeleton className="h-24 w-full rounded-2xl" />

            {/* The article: prose column, plus the sticky contents rail that
                only exists from xl up. */}
            <div className="mt-4 grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
                <div className="hidden min-w-0 flex-col gap-2 xl:order-2 xl:flex">
                    <Skeleton className="h-3 w-24" />
                    {Array.from({ length: 9 }, (_, index) => (
                        <Skeleton key={index} className="h-4 w-full max-w-40" />
                    ))}
                </div>

                <div className="flex min-w-0 flex-col gap-12 xl:order-1">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-3">
                            <Skeleton className="h-6 w-full max-w-sm" />
                            <Skeleton className="h-4 w-full max-w-2xl" />
                            <Skeleton className="h-4 w-full max-w-xl" />
                            <Skeleton className="h-4 w-full max-w-lg" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
