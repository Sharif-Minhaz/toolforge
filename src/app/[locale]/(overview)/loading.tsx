import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the overview layout so the page does not jump when content lands. */
export default function OverviewLoading() {
    return (
        <div className="flex flex-col gap-12 lg:gap-16" aria-hidden="true">
            <section className="bg-card/60 ring-border/70 rounded-3xl px-6 py-12 ring-1 ring-inset sm:px-10 sm:py-14 lg:py-16">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-12">
                    <div className="flex flex-col gap-6">
                        <Skeleton className="h-6 w-56 rounded-full" />
                        <div className="flex flex-col gap-3">
                            <Skeleton className="h-11 w-full max-w-lg" />
                            <Skeleton className="h-11 w-4/5 max-w-md" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-full max-w-xl" />
                            <Skeleton className="h-4 w-11/12 max-w-lg" />
                        </div>
                        <div className="flex gap-2.5">
                            <Skeleton className="h-10 w-48 rounded-lg" />
                            <Skeleton className="h-10 w-36 rounded-lg" />
                        </div>
                    </div>
                    <Skeleton className="h-36 w-full rounded-2xl" />
                </div>
            </section>

            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                    <li key={index}>
                        <Skeleton className="h-28 w-full rounded-2xl" />
                    </li>
                ))}
            </ul>

            <div className="flex flex-col gap-4">
                <Skeleton className="h-6 w-40" />
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <li key={index}>
                            <Skeleton className="h-24 w-full rounded-2xl" />
                        </li>
                    ))}
                </ul>
            </div>

            <div className="flex flex-col gap-4">
                <Skeleton className="h-6 w-44" />
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, index) => (
                        <li key={index}>
                            <Skeleton className="h-44 w-full rounded-2xl" />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
