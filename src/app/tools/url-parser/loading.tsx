import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the URL Parser layout: header, workbench card, article, related. */
export default function UrlParserLoading() {
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
                        <Skeleton key={index} className="h-6 w-28 rounded-full" />
                    ))}
                </div>
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-56" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-3.5 w-10" />
                        <Skeleton className="h-8 w-32 rounded-lg" />
                    </div>
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-64 max-w-full" />
                </div>

                {/* The tab strip is sized to its two choices, not the card. */}
                <Skeleton className="h-8 w-full max-w-72 rounded-lg" />

                <div className="flex flex-col gap-1.5">
                    {Array.from({ length: 9 }, (_, index) => (
                        <div
                            key={index}
                            className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
                        >
                            <Skeleton className="h-3.5 w-16 justify-self-end" />
                            <Skeleton className="h-9 w-full rounded-lg" />
                            <Skeleton className="size-7 rounded-lg" />
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <Skeleton className="h-8 w-24 rounded-lg" />
                    <Skeleton className="h-8 w-26 rounded-lg" />
                    <Skeleton className="h-8 w-32 rounded-lg" />
                </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
                <div className="xl:order-2">
                    <Skeleton className="h-48 w-full rounded-xl" />
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

            <div className="border-border/70 flex flex-col gap-4 border-t pt-8">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-40 w-full rounded-2xl" />
                    ))}
                </div>
            </div>
        </div>
    );
}
