import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the page: header, the workbench card block for block, then the article. */
export default function TextToSpeechLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-72 sm:h-10" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full max-w-xl" />
                    <Skeleton className="h-4 w-3/5 max-w-md" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 5 }, (_, index) => (
                        <Skeleton key={index} className="h-6 w-28 rounded-full" />
                    ))}
                </div>
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-4 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                {/* Tabs, then the disclosure line. */}
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-xl" />

                {/* Meter pill on the left, Pauses and Clear on the right. */}
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-8 w-24 rounded-full" />
                    <div className="flex gap-2">
                        <Skeleton className="h-8 w-24 rounded-full" />
                        <Skeleton className="h-8 w-20 rounded-full" />
                    </div>
                </div>

                <Skeleton className="h-64 w-full rounded-2xl sm:h-80" />
                <Skeleton className="h-3.5 w-64" />

                {/* Language, voice, settings gear. */}
                <div className="flex items-end gap-3">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <Skeleton className="h-10 w-full rounded-full" />
                        <Skeleton className="h-10 w-full rounded-full" />
                    </div>
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                </div>

                <Skeleton className="h-16 w-full max-w-82 rounded-lg" />
                <Skeleton className="h-12 w-full rounded-full" />
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
                <div className="hidden xl:order-2 xl:block">
                    <Skeleton className="h-56 w-full rounded-xl" />
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
