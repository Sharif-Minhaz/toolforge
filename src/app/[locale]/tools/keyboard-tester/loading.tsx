import { Skeleton } from "@/components/ui/skeleton";
import { KeyboardTesterWorkbenchSkeleton } from "@/modules/keyboard-tester/components/keyboard-tester-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";

/**
 * Mirrors the Keyboard Tester layout: header, then the card — the three
 * selects, the four counters, the board with its strip of recent keys, and the
 * three panels under it — then the article.
 */
export default function KeyboardTesterLoading() {
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

            <KeyboardTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
