import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the MCP guide: header, then the article column with its sticky table
 * of contents beside it. The right-hand rail only exists from `xl`, so the
 * skeleton hides it below that width exactly as the page does — a placeholder
 * for something that will never appear is worse than no placeholder.
 */
export default function McpLoading() {
    return (
        <div className="flex flex-col gap-10 lg:gap-12" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-80 sm:h-10" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full max-w-xl" />
                    <Skeleton className="h-4 w-3/5 max-w-md" />
                </div>
                <div className="flex gap-1.5">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-6 w-28 rounded-full" />
                    ))}
                </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
                <div className="hidden min-w-0 xl:order-2 xl:block">
                    <div className="flex flex-col gap-2.5">
                        <Skeleton className="h-3.5 w-24" />
                        {Array.from({ length: 8 }, (_, index) => (
                            <Skeleton key={index} className="h-3.5 w-full max-w-40" />
                        ))}
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-12 xl:order-1">
                    {Array.from({ length: 3 }, (_, section) => (
                        <div key={section} className="flex flex-col gap-4">
                            <Skeleton className="h-6 w-56" />
                            <Skeleton className="h-4 w-full max-w-[68ch]" />
                            <Skeleton className="h-4 w-4/5 max-w-[60ch]" />
                            <Skeleton className="h-24 w-full rounded-xl" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
