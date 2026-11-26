import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Type and length with the
 * folded options on top, then the result tray.
 */
export function PasswordWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-12 w-full rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                        <Skeleton className="h-3 w-2/5" />
                    </div>
                </div>
                <Skeleton className="h-5 w-24" />
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-40" />

                {/* Output block, then the copy and regenerate buttons. */}
                <Skeleton className="h-15 w-full rounded-2xl" />
                <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-9 w-36 rounded-lg" />
                    <Skeleton className="h-9 w-36 rounded-lg" />
                </div>

                {/* Strength bar and the crack-time line under it. */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-1.5 flex-1 rounded-full" />
                        <Skeleton className="h-3.5 w-20" />
                    </div>
                    <Skeleton className="h-3 w-4/5 max-w-md" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 2 }, (_, index) => (
                        <Skeleton key={index} className="h-13 w-full rounded-xl" />
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-13 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        </div>
    );
}
