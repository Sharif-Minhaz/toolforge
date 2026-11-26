import { Skeleton } from "@/components/ui/skeleton";

/**
 * The secret generator card while it waits: the fallback for the request-time
 * half of the page, and the matching block in `loading.tsx`. Byte length,
 * encoding and the folded options on top, then the result tray.
 */
export function SecretWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-5">
                {/* Byte length: field, steppers, presets. */}
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-40" />
                    <div className="flex flex-wrap items-center gap-2">
                        <Skeleton className="h-9 w-32 rounded-xl" />
                        {Array.from({ length: 5 }, (_, index) => (
                            <Skeleton key={index} className="h-7 w-10 rounded-lg" />
                        ))}
                    </div>
                    <Skeleton className="h-3.5 w-56" />
                </div>

                {/* Encoding and padding. */}
                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    {Array.from({ length: 2 }, (_, column) => (
                        <div key={column} className="flex flex-col gap-2">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                            <Skeleton className="h-3.5 w-4/5" />
                        </div>
                    ))}
                </div>

                <Skeleton className="h-5 w-24" />
            </div>

            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-36" />

                {/* The secret, then copy and redraw. */}
                <Skeleton className="h-16 w-full rounded-2xl" />
                <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-9 w-32 rounded-lg" />
                    <Skeleton className="h-9 w-32 rounded-lg" />
                </div>

                {/* Entropy, bytes, characters, grade. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-xl" />
                    ))}
                </div>

                <Skeleton className="h-px w-full rounded-none" />

                {/* The equivalent shell command. */}
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-3.5 w-3/5" />
                </div>
            </div>
        </div>
    );
}
