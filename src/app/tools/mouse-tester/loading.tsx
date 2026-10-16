import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the Mouse Tester layout: header, then the card — the capture area
 * with its action and hold strips beside the tiles, gauge and slider — then
 * the diagnosis and the log, then the article.
 */
export default function MouseTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-56 sm:h-10" />
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
                <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
                        <Skeleton className="min-h-80 w-full rounded-2xl sm:min-h-96" />
                        <Skeleton className="h-14 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                    </div>

                    <div className="flex flex-col gap-4 p-4 sm:p-5">
                        <Skeleton className="h-3 w-28" />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {Array.from({ length: 12 }, (_, index) => (
                                <Skeleton key={index} className="h-16 rounded-xl" />
                            ))}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Skeleton className="h-20 rounded-xl" />
                            <Skeleton className="h-20 rounded-xl" />
                        </div>
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-1.5 w-full rounded-full" />
                            <Skeleton className="h-3 w-4/5" />
                        </div>
                    </div>
                </div>

                <div className="border-border/70 grid gap-4 border-t p-4 sm:p-5 lg:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-60 w-full rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-24" />
                            <div className="flex gap-1.5">
                                <Skeleton className="h-7 w-20 rounded-lg" />
                                <Skeleton className="h-7 w-20 rounded-lg" />
                            </div>
                        </div>
                        <Skeleton className="h-72 w-full rounded-xl" />
                    </div>
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
