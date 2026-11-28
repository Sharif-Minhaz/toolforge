import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";
import { ToolPageHeaderSkeleton } from "@/modules/tools/components/tool-page-header-skeleton";
import { WebcamTesterWorkbenchSkeleton } from "@/modules/webcam-tester/components/webcam-tester-workbench-skeleton";

/**
 * Mirrors the Webcam Tester layout: header, then the card — the preview with
 * its controls beside the report — then the article.
 */
export default function WebcamTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <ToolPageHeaderSkeleton titleClassName="w-56" badgeClassName="w-36" />

            <WebcamTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
