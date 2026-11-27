import { Skeleton } from "@/components/ui/skeleton";

/** Rows per group in the result: eleven Bangladeshi units, six international ones. */
const GROUP_ROWS = [11, 6] as const;

/**
 * The card while it waits: the fallback for the request-time half of the page,
 * and the matching block in `loading.tsx`. The area and its unit, the folded
 * district sizes, the two groups of figures — one at a time behind a switch
 * below `lg` — then the pitch.
 */
export function LandWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <div className="flex min-h-7 items-center justify-between gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="size-7 rounded-lg" />
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                        <Skeleton className="h-10 min-w-0 flex-1 rounded-lg lg:h-9" />
                        <Skeleton className="h-10 w-40 shrink-0 rounded-lg sm:w-56 lg:h-9" />
                    </div>
                    <Skeleton className="h-3.5 w-full max-w-sm" />
                </div>
                <Skeleton className="h-5 w-32" />
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <div className="flex min-h-7 items-center justify-between gap-2">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-7 w-24 rounded-lg" />
                </div>
                <Skeleton className="h-10 w-full rounded-xl lg:hidden" />
                <div className="grid gap-4 lg:grid-cols-2">
                    {GROUP_ROWS.map((rows, group) => (
                        <div
                            key={group}
                            className={
                                group === 0
                                    ? "flex flex-col gap-2"
                                    : "flex flex-col gap-2 max-lg:hidden"
                            }
                        >
                            <Skeleton className="h-3.5 w-32 max-lg:hidden" />
                            <div className="flex flex-col gap-1.5">
                                {Array.from({ length: rows }, (_, index) => (
                                    <Skeleton
                                        key={index}
                                        className="h-[3.25rem] w-full rounded-lg"
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <Skeleton className="h-3.5 w-52" />
            </div>

            <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="mx-auto aspect-[110/73] w-full max-w-3xl rounded-lg" />
                <Skeleton className="h-4 w-72 max-w-full" />
                <Skeleton className="h-3.5 w-48" />
            </div>
        </div>
    );
}
