import { Skeleton } from "@/components/ui/skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";
import { WebcamTesterWorkbenchSkeleton } from "@/modules/webcam-tester/components/webcam-tester-workbench-skeleton";

/**
 * Mirrors the Webcam Tester layout: header, then the card — the preview with
 * its controls beside the report — then the article.
 */
export default function WebcamTesterLoading() {
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
                        <Skeleton key={index} className="h-4 w-36" />
                    ))}
                </div>
            </div>

            <WebcamTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
