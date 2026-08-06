import { Skeleton } from "@/components/ui/skeleton";

/**
 * Matches the workbench block for block: the back link, the header card with its
 * base URL and usage bar, the tab row, then the route table the Routes tab opens
 * on. A skeleton that does not agree with what replaces it reads as a layout
 * shift rather than as loading.
 */
export default function GraphqlServerDetailLoading() {
    return (
        <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
            <Skeleton className="h-4 w-24" />

            <div className="border-border/70 bg-card flex flex-col gap-4 rounded-2xl border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-8 w-24 rounded-xl" />
                </div>

                <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1 rounded-xl" />
                    <Skeleton className="h-9 w-20 rounded-xl" />
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-3 w-10" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
            </div>

            <div className="flex flex-wrap gap-1">
                <Skeleton className="h-8 w-20 rounded-xl" />
                <Skeleton className="h-8 w-16 rounded-xl" />
                <Skeleton className="h-8 w-16 rounded-xl" />
                <Skeleton className="h-8 w-20 rounded-xl" />
            </div>

            <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
    );
}
