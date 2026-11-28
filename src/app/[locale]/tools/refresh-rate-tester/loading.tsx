import { RefreshRateTesterWorkbenchSkeleton } from "@/modules/refresh-rate-tester/components/refresh-rate-tester-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";
import { ToolPageHeaderSkeleton } from "@/modules/tools/components/tool-page-header-skeleton";

/**
 * Mirrors the Refresh Rate Tester layout: header, then the card — the reading
 * beside the timing tiles, the motion test under both — then the article.
 */
export default function RefreshRateTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <ToolPageHeaderSkeleton titleClassName="w-64" badgeClassName="w-36" />

            <RefreshRateTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
