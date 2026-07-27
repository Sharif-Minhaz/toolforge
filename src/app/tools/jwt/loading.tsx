import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the JWT tool layout: header, two-column workbench, then the article. */
export default function JwtLoading() {
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

                <div className="flex max-w-md flex-col gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Skeleton className="h-4 w-72 max-w-full" />
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-32 rounded-lg" />
                        <Skeleton className="h-8 w-24 rounded-lg" />
                    </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-2 xl:gap-6">
                    <div className="flex min-w-0 flex-col gap-4">
                        <div className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                            <div className="flex items-center justify-between gap-2">
                                <Skeleton className="h-3.5 w-28" />
                                <Skeleton className="h-7 w-16 rounded-lg" />
                            </div>
                            <Skeleton className="h-36 w-full rounded-lg" />
                            <div className="flex gap-1.5">
                                {Array.from({ length: 3 }, (_, index) => (
                                    <Skeleton key={index} className="h-6 w-24 rounded-lg" />
                                ))}
                            </div>
                            <Skeleton className="h-3.5 w-32" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-14 w-full rounded-xl" />
                        </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-4">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="h-7 w-40 rounded-lg" />
                        </div>

                        {Array.from({ length: 2 }, (_, index) => (
                            <div
                                key={index}
                                className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <Skeleton className="h-3.5 w-36" />
                                    <Skeleton className="size-7 rounded-lg" />
                                </div>
                                <Skeleton className="h-28 w-full rounded-lg" />
                            </div>
                        ))}

                        <Skeleton className="h-px w-full rounded-none" />

                        <div className="flex flex-col gap-3">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-9 w-full rounded-lg sm:w-44" />
                            <div className="ring-border/70 flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                                <Skeleton className="h-3.5 w-20" />
                                <Skeleton className="h-16 w-full rounded-lg" />
                                <Skeleton className="h-3.5 w-40" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
                <div className="xl:order-2">
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
