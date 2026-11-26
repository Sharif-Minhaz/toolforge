import { Skeleton } from "@/components/ui/skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";

/** Mirrors the page: header, the workbench card block for block, then the article. */
export default function TextToSpeechLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-72 sm:h-10" />
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

            <div className="bg-card ring-border/70 flex flex-col gap-4 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                {/* The disclosure, then the tabs. */}
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
                <Skeleton className="h-8 w-full rounded-lg" />

                {/* Step label and meter on the left, Pauses and Clear on the right. */}
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-5 w-32" />
                    <div className="flex gap-2">
                        <Skeleton className="h-8 w-24 rounded-full" />
                        <Skeleton className="h-8 w-20 rounded-full" />
                    </div>
                </div>

                <Skeleton className="h-64 w-full rounded-2xl sm:h-80" />
                <Skeleton className="h-3.5 w-64" />

                {/* The result tray: language, voice, settings, then Generate. */}
                <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <Skeleton className="h-5 w-36" />
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
