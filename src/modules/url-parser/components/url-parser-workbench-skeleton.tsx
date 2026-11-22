import { Skeleton } from "@/components/ui/skeleton";

/**
 * The parser card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`.
 */
export function UrlParserWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-10" />
                    <Skeleton className="h-8 w-32 rounded-lg" />
                </div>
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>

            {/* The tab strip is sized to its two choices, not the card. */}
            <Skeleton className="h-8 w-full max-w-72 rounded-lg" />

            <div className="flex flex-col gap-1.5">
                {Array.from({ length: 9 }, (_, index) => (
                    <div
                        key={index}
                        className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
                    >
                        <Skeleton className="h-3.5 w-16 justify-self-end" />
                        <Skeleton className="h-9 w-full rounded-lg" />
                        <Skeleton className="size-7 rounded-lg" />
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-26 rounded-lg" />
                <Skeleton className="h-8 w-32 rounded-lg" />
            </div>
        </div>
    );
}
