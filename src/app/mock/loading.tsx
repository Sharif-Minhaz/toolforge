import { Skeleton } from "@/components/ui/skeleton";

/**
 * Matches `page.tsx` block for block: header, badge row, disclosure panel,
 * workspace grid, then the create/import card. A skeleton that does not agree
 * with what replaces it reads as a layout shift rather than as loading.
 */
export default function MockStudioLoading() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-full max-w-md" />
                <Skeleton className="h-4 w-full max-w-2xl" />
                <Skeleton className="h-4 w-full max-w-lg" />
                <div className="mt-1 flex flex-wrap gap-2">
                    <Skeleton className="h-6 w-28 rounded-lg" />
                    <Skeleton className="h-6 w-32 rounded-lg" />
                    <Skeleton className="h-6 w-24 rounded-lg" />
                </div>
            </div>

            <Skeleton className="h-24 w-full rounded-2xl" />

            <div className="flex flex-col gap-6">
                <div>
                    <Skeleton className="h-3 w-32" />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Skeleton className="h-36 rounded-2xl" />
                        <Skeleton className="h-36 rounded-2xl" />
                    </div>
                </div>

                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        </div>
    );
}
