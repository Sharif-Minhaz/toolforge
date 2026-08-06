import { Skeleton } from "@/components/ui/skeleton";

/**
 * The route editor's shape while a route is being fetched.
 *
 * Block for block against the real form: the public address, the four fields in
 * their two-column grid, the enabled row with its switch to the right, the
 * response body, the flow card, and the save button. A single grey rectangle
 * would be cheaper to write and would tell the reader nothing about what is
 * arriving — and the point of a skeleton is that the page does not move when it
 * resolves.
 *
 * Not a client component: it is markup and nothing else, so both the route's
 * `loading.tsx` and the workbench can render it.
 */
export function EndpointSkeleton() {
    return (
        <div
            className="border-border/70 bg-card flex flex-col gap-4 rounded-2xl border p-5 shadow-xs"
            // One announcement for the whole panel, so a screen reader is told
            // the editor is loading rather than read fifteen empty boxes.
            role="status"
            aria-busy="true"
        >
            <Skeleton className="h-9 w-full rounded-xl" />

            <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((field) => (
                    <div key={field} className="flex flex-col gap-1.5">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
            </div>

            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full max-w-[52ch]" />
                <Skeleton className="h-3 w-full max-w-[44ch]" />
                <Skeleton className="mt-1 h-28 w-full rounded-xl" />
            </div>

            <Skeleton className="h-20 w-full rounded-xl" />

            <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
    );
}
