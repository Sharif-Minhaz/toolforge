import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the QR tool layout: header, two-column workbench, then the article. */
export default function QrLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-72 sm:h-10" />
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
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-72" />
                </div>

                <Skeleton className="h-8 w-full rounded-lg" />

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-8">
                    <div className="flex min-w-0 flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-3.5 w-24" />
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {Array.from({ length: 7 }, (_, index) => (
                                    <Skeleton key={index} className="h-16 w-full rounded-xl" />
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3 w-56" />
                        </div>

                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-13 w-full rounded-xl" />
                    </div>

                    <div className="flex min-w-0 flex-col gap-3">
                        <Skeleton className="aspect-square w-full rounded-2xl" />
                        <Skeleton className="mx-auto h-3 w-40" />
                        <Skeleton className="mx-auto h-3 w-24" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <div className="grid grid-cols-2 gap-2">
                            <Skeleton className="h-8 w-full rounded-xl" />
                            <Skeleton className="h-8 w-full rounded-xl" />
                        </div>
                    </div>
                </div>
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
        </div>
    );
}
