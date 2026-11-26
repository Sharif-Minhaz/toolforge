import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Tabs, then type and
 * fields beside the preview tray from `lg` up, with the design folded.
 */
export function QrWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <Skeleton className="h-8 w-full rounded-lg" />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-8">
                <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-5 w-32" />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {Array.from({ length: 7 }, (_, index) => (
                                <Skeleton key={index} className="h-16 w-full rounded-xl" />
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                        <Skeleton className="h-3 w-56" />
                    </div>

                    <Skeleton className="h-20 w-full rounded-xl" />
                    {/* The folded design options: only their summary line shows. */}
                    <Skeleton className="h-5 w-36" />
                </div>

                <div className="bg-muted/40 ring-border flex min-w-0 flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="aspect-square w-full rounded-2xl" />
                    <Skeleton className="mx-auto h-3 w-40" />
                    <Skeleton className="mx-auto h-3 w-24" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                    <div className="grid grid-cols-2 gap-2">
                        <Skeleton className="h-8 w-full rounded-xl" />
                        <Skeleton className="h-8 w-full rounded-xl" />
                    </div>
                </div>
            </div>
        </div>
    );
}
