import { Skeleton } from "@/components/ui/skeleton";
import { RsaCryptWorkbenchSkeleton } from "@/modules/rsa-encrypt/components/rsa-crypt-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";
import { ToolPageHeaderSkeleton } from "@/modules/tools/components/tool-page-header-skeleton";

/** Mirrors the RSA encrypt / decrypt layout: header, workbench, then the article. */
export default function RsaEncryptLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <ToolPageHeaderSkeleton />

            <RsaCryptWorkbenchSkeleton />

            <ArticleSkeleton />

            <div className="border-border/70 flex flex-col gap-4 border-t pt-8">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-40 w-full rounded-2xl" />
                    ))}
                </div>
            </div>
        </div>
    );
}
