import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the converter layout block for block: header, then the card with its
 * source switch, its paste panel, four selects, six switches, the summary strip
 * and the button, then the article and the related strip.
 */
export default function PdfConverterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-96 max-w-full sm:h-10" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full max-w-xl" />
                    <Skeleton className="h-4 w-3/5 max-w-md" />
                </div>
                <div className="flex gap-1.5">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-6 w-32 rounded-full" />
                    ))}
                </div>
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>

                {/* Source switch */}
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-44" />
                    <Skeleton className="h-10 w-60 rounded-xl" />
                </div>

                {/* Format switch, then the document box */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-10 w-64 rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="h-7 w-24 rounded-lg" />
                        </div>
                        <Skeleton className="h-44 w-full rounded-xl" />
                    </div>
                </div>

                <Skeleton className="h-px w-full rounded-none" />

                {/* Four selects */}
                <div className="flex flex-col gap-4">
                    <Skeleton className="h-3.5 w-40" />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 4 }, (_, index) => (
                            <div key={index} className="flex flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-24" />
                                <Skeleton className="h-8 w-full rounded-lg" />
                            </div>
                        ))}
                    </div>

                    {/* Six switches */}
                    <div className="grid gap-2.5 sm:grid-cols-2">
                        {Array.from({ length: 6 }, (_, index) => (
                            <Skeleton key={index} className="h-16 w-full rounded-xl" />
                        ))}
                    </div>
                </div>

                <Skeleton className="h-px w-full rounded-none" />

                {/* Summary strip and the button */}
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-3.5 w-28" />
                    <div className="flex gap-1.5">
                        {Array.from({ length: 3 }, (_, index) => (
                            <Skeleton key={index} className="h-6 w-24 rounded-full" />
                        ))}
                    </div>
                </div>

                <Skeleton className="h-9 w-36 rounded-lg" />
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
