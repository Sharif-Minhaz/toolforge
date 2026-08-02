import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the password tool: header, generator card, then the article. */
export default function PasswordLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-44" />
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
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-72" />
                </div>

                {/* Output block, then the copy and regenerate buttons. */}
                <Skeleton className="h-15 w-full rounded-2xl" />
                <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-9 w-36 rounded-lg" />
                    <Skeleton className="h-9 w-36 rounded-lg" />
                </div>

                {/* Strength bar and the crack-time line under it. */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-1.5 flex-1 rounded-full" />
                        <Skeleton className="h-3.5 w-20" />
                    </div>
                    <Skeleton className="h-3 w-4/5 max-w-md" />
                </div>

                <Skeleton className="h-px w-full rounded-none" />

                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-12 w-full rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                        <Skeleton className="h-3 w-2/5" />
                    </div>
                </div>

                <Skeleton className="h-px w-full rounded-none" />

                {/* Characters, exclusions, then the passphrase group. */}
                {[4, 2, 2].map((switches, group) => (
                    <div key={group} className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-24" />
                        <div className="grid gap-2 sm:grid-cols-2">
                            {Array.from({ length: switches }, (_, index) => (
                                <Skeleton key={index} className="h-14 w-full rounded-xl" />
                            ))}
                        </div>
                    </div>
                ))}

                <Skeleton className="h-px w-full rounded-none" />

                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-4/5" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: 2 }, (_, index) => (
                            <Skeleton key={index} className="h-13 w-full rounded-xl" />
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-13 w-full rounded-xl" />
                    ))}
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
