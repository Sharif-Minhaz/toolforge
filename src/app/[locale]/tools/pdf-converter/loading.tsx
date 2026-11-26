import { Skeleton } from "@/components/ui/skeleton";
import { PdfConverterWorkbenchSkeleton } from "@/modules/pdf-converter/components/pdf-converter-workbench-skeleton";
import { ArticleSkeleton } from "@/modules/tools/components/article-skeleton";

/**
 * Mirrors the converter layout block for block: header, then the card with its
 * source switch, its paste panel, four selects, six switches, the summary strip
 * and the button, then the article and the related strip.
 */
export default function PdfConverterLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-96 max-w-full sm:h-10" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                </div>
                <div className="flex gap-1.5">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-6 w-32 rounded-full" />
                    ))}
                </div>
            </div>

            <PdfConverterWorkbenchSkeleton />

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
