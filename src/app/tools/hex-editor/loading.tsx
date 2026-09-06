import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the Hex Editor layout: header, editor shell, then the article. */
export default function HexEditorLoading() {
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

            <div className="bg-card ring-border/70 flex flex-col overflow-hidden rounded-xl ring-1 ring-inset">
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
