import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. The intake on the left,
 * the settings column with its folded options and the Compress press on the
 * right, from `lg` up.
 */
export function ImageCompressorWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex flex-col gap-2 lg:self-stretch">
                    <Skeleton className="min-h-52 w-full flex-1 rounded-xl" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-3.5 w-64" />
                </div>

                <div className="flex flex-col gap-4">
                    <Skeleton className="h-4 w-20" />
                    {Array.from({ length: 2 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3 w-40" />
                        </div>
                    ))}
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                </div>
            </div>

            <Skeleton className="h-3 w-full max-w-lg" />
        </div>
    );
}
