import { Skeleton } from "@/components/ui/skeleton";

/**
 * Matches the workspace page block for block: header, the row of three section
 * chips, the create card, then the server grid.
 */
export default function WorkspaceLoading() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-full max-w-md" />
                <Skeleton className="h-4 w-full max-w-2xl" />
                <div className="mt-1 flex flex-wrap gap-2">
                    <Skeleton className="h-7 w-32 rounded-lg" />
                    <Skeleton className="h-7 w-28 rounded-lg" />
                    <Skeleton className="h-7 w-36 rounded-lg" />
                </div>
            </div>

            <div className="flex flex-col gap-6">
                <Skeleton className="h-56 w-full rounded-2xl" />

                <div>
                    <Skeleton className="h-3 w-28" />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Skeleton className="h-40 rounded-2xl" />
                        <Skeleton className="h-40 rounded-2xl" />
                    </div>
                </div>
            </div>
        </div>
    );
}
