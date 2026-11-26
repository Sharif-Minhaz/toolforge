import { Skeleton } from "@/components/ui/skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";

/** Mirrors the remover layout: header, workbench card, then the article. */
export default function WatermarkRemoverLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-80 sm:h-10" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 5 }, (_, index) => (
                        <Skeleton key={index} className="h-4 w-28" />
                    ))}
                </div>
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <Skeleton className="h-8 w-full rounded-lg" />

                {/* The image tab's upload disclosure line. */}
                <Skeleton className="h-4 w-full max-w-xl" />

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

            <ArticleSkeleton />

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
