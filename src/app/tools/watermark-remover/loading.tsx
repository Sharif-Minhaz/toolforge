import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the remover layout: header, workbench card, then the article. */
export default function WatermarkRemoverLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-80 sm:h-10" />
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
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-4 w-72" />
                </div>

                <div className="flex flex-col gap-2">
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-64" />
                </div>

                <Skeleton className="h-16 w-full max-w-82 rounded-lg" />

                <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-9 w-36 rounded-lg" />
                    <Skeleton className="h-9 w-24 rounded-lg" />
                </div>

                <Skeleton className="h-3 w-full max-w-lg" />
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
                <div className="xl:order-2">
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
