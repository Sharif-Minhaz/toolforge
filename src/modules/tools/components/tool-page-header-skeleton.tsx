import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ToolPageHeaderSkeletonProps = {
    /** Width of the title bar — roughly the tool's own title. */
    titleClassName?: string;
    /** Width of each badge bar. */
    badgeClassName?: string;
    badgeCount?: number;
};

/**
 * {@link ToolPageHeader} while the route loads, block for block: breadcrumb
 * with the "Improve" button beside it, title, two subtitle lines, the badges.
 */
export function ToolPageHeaderSkeleton({
    titleClassName = "w-80",
    badgeClassName = "w-28",
    badgeCount = 3,
}: ToolPageHeaderSkeletonProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-7 w-24 rounded-lg" />
            </div>
            <Skeleton className={cn("h-9 max-w-full sm:h-10", titleClassName)} />
            <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/5" />
            </div>
            <div className="flex gap-1.5">
                {Array.from({ length: badgeCount }, (_, index) => (
                    <Skeleton key={index} className={cn("h-4", badgeClassName)} />
                ))}
            </div>
        </div>
    );
}
