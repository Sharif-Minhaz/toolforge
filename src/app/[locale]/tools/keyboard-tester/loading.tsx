import { KeyboardTesterWorkbenchSkeleton } from "@/modules/keyboard-tester/components/keyboard-tester-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";
import { ToolPageHeaderSkeleton } from "@/modules/tools/components/tool-page-header-skeleton";

/**
 * Mirrors the Keyboard Tester layout: header, then the card — the three
 * selects, the four counters, the board with its strip of recent keys, and the
 * three panels under it — then the article.
 */
export default function KeyboardTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <ToolPageHeaderSkeleton titleClassName="w-64" badgeClassName="w-36" />

            <KeyboardTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
