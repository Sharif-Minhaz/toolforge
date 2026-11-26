import { Skeleton } from "@/components/ui/skeleton";
import { MouseTesterWorkbenchSkeleton } from "@/modules/mouse-tester/components/mouse-tester-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";

/**
 * Mirrors the Mouse Tester layout: header, then the card — the capture area
 * with its action and hold strips beside the tiles, gauge and slider — then
 * the diagnosis and the log, then the article.
 */
export default function MouseTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-56 sm:h-10" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                </div>
                <div className="flex gap-1.5">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-6 w-36 rounded-full" />
                    ))}
                </div>
            </div>

            <MouseTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
