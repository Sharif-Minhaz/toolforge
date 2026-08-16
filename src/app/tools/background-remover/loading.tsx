import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the workbench layout: header, card, article, related tools. */
export default function BackgroundRemoverLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-9 w-80 sm:h-10" />
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
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>

                {/* Drop zone, then the paste row underneath it. */}
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-36 w-full rounded-xl" />
                    <Skeleton className="h-8 w-full rounded-lg" />
                </div>

                {/* Cut-out quality. */}
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-40" />
                    </div>
                </div>

                {/* Picture on the left, background picker on the right. */}
                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="flex flex-col gap-3">
                        {/* The picture card, its verdict line, and the two buttons. */}
                        <div className="ring-border/70 flex flex-col gap-2 rounded-2xl p-3 ring-1 ring-inset sm:p-4">
                            <Skeleton className="mx-auto aspect-3/2 w-full rounded-lg" />
                        </div>
                        <Skeleton className="h-3 w-64" />
                        <div className="flex gap-2">
                            <Skeleton className="h-9 w-40 rounded-xl" />
                            <Skeleton className="h-9 w-28 rounded-xl" />
                        </div>
                    </div>

                    {/* The three-tab background picker, tabs then a scrolling grid. */}
                    <div className="ring-border/70 flex flex-col gap-3 rounded-2xl p-3 ring-1 ring-inset sm:p-4">
                        <Skeleton className="h-8 w-full rounded-lg" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <div className="grid grid-cols-3 gap-2">
                            {Array.from({ length: 9 }, (_, index) => (
                                <Skeleton key={index} className="aspect-[4/3] w-full rounded-lg" />
                            ))}
                        </div>
                    </div>
                </div>

                {/* The strip, centred under both columns. */}
                <div className="flex justify-center gap-2">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="size-16 shrink-0 rounded-xl" />
                    ))}
                </div>

                <Skeleton className="h-3 w-full max-w-lg" />
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
