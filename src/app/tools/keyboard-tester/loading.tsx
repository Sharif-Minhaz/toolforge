import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the Keyboard Tester layout: header, then the card — the three
 * selects, the four counters, the board with its strip of recent keys, and the
 * three panels under it — then the article.
 */
export default function KeyboardTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-64 sm:h-10" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full max-w-xl" />
                    <Skeleton className="h-4 w-3/5 max-w-md" />
                </div>
                <div className="flex gap-1.5">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-6 w-36 rounded-full" />
                    ))}
                </div>
            </div>

            <div className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset">
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

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
                <div className="hidden xl:order-2 xl:block">
                    <Skeleton className="h-64 w-full rounded-xl" />
                </div>
                <div className="flex flex-col gap-10 xl:order-1">
                    {Array.from({ length: 3 }, (_, section) => (
                        <div key={section} className="flex flex-col gap-4">
                            <Skeleton className="h-6 w-56" />
                            <div className="flex flex-col gap-2.5">
                                {Array.from({ length: 5 }, (_, line) => (
                                    <Skeleton
                                        key={line}
                                        className={line === 4 ? "h-4 w-2/3" : "h-4 w-full"}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
