import { MicTesterWorkbenchSkeleton } from "@/modules/mic-tester/components/mic-tester-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";
import { ToolPageHeaderSkeleton } from "@/modules/tools/components/tool-page-header-skeleton";

/**
 * Mirrors the Microphone Tester layout: header, then the card — the meter with
 * its controls beside the recorder and the report — then the article.
 */
export default function MicTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <ToolPageHeaderSkeleton titleClassName="w-64" badgeClassName="w-36" />

            <MicTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
