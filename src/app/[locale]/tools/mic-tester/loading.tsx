import { Skeleton } from "@/components/ui/skeleton";
import { MicTesterWorkbenchSkeleton } from "@/modules/mic-tester/components/mic-tester-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";

/**
 * Mirrors the Microphone Tester layout: header, then the card — the meter with
 * its controls beside the recorder and the report — then the article.
 */
export default function MicTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-64 sm:h-10" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                </div>
                <div className="flex gap-1.5">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-4 w-36" />
                    ))}
                </div>
            </div>

            <MicTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
