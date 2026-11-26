import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors every tool article: the opening section — two paragraphs around one
 * example line — then the FAQ, whose first answer starts open.
 */
export function ArticleSkeleton() {
    return (
        <div className="flex flex-col gap-12">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-6 w-56" />
                <div className="flex flex-col gap-2.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
                <Skeleton className="h-5 w-full max-w-md" />
                <div className="flex flex-col gap-2.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <Skeleton className="h-6 w-40" />
                <div className="flex flex-col gap-2.5">
                    <Skeleton className="h-32 w-full rounded-xl" />
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-13 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        </div>
    );
}
