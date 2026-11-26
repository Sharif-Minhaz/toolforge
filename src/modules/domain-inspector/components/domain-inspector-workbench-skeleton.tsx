import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Field, challenge, the
 * folded options, then the result actions.
 */
export function DomainInspectorWorkbenchSkeleton() {
    return (
        <div aria-hidden="true" className="flex min-w-0 flex-col gap-4">
            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                {/* The lookup console: one frame holding the field and its verdict. */}
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                </div>

                <Skeleton className="h-16 w-full max-w-82 rounded-lg" />

                {/* The folded options: only their summary line shows. */}
                <Skeleton className="h-5 w-24" />

                <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-9 w-24 rounded-lg" />
                    <Skeleton className="h-9 w-28 rounded-lg" />
                    <Skeleton className="h-9 w-20 rounded-lg" />
                </div>

                <Skeleton className="h-3 w-full max-w-lg" />
            </div>

            {/* The propagation card: verdict, then the node list beside the map. */}
            <div className="bg-card ring-border/70 flex flex-col gap-4 rounded-2xl p-5 ring-1 ring-inset sm:p-6">
                <Skeleton className="h-2.5 w-32" />
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-6 w-44" />
                    <Skeleton className="h-4 w-full max-w-sm" />
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                    <Skeleton className="h-56 w-full rounded-xl sm:h-72" />
                    <Skeleton className="order-first h-56 w-full rounded-xl sm:h-72 xl:order-0" />
                </div>
            </div>
        </div>
    );
}
