import { MouseTesterWorkbenchSkeleton } from "@/modules/mouse-tester/components/mouse-tester-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";
import { ToolPageHeaderSkeleton } from "@/modules/tools/components/tool-page-header-skeleton";

/**
 * Mirrors the Mouse Tester layout: header, then the card — the capture area
 * with its action and hold strips beside the tiles, gauge and slider — then
 * the diagnosis and the log, then the article.
 */
export default function MouseTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <ToolPageHeaderSkeleton titleClassName="w-56" badgeClassName="w-36" />

            <MouseTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
