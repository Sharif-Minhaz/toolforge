import { ScreenTesterWorkbenchSkeleton } from "@/modules/screen-tester/components/screen-tester-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";
import { ToolPageHeaderSkeleton } from "@/modules/tools/components/tool-page-header-skeleton";

/** Mirrors the Screen Tester layout: header, the workbench card, then the article. */
export default function ScreenTesterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <ToolPageHeaderSkeleton titleClassName="w-72" badgeClassName="w-36" />

            <ScreenTesterWorkbenchSkeleton />

            <ArticleSkeleton />
        </div>
    );
}
