import { Skeleton } from "@/components/ui/skeleton";

/**
 * The workbench card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Source and document, the
 * folded page options, then the result tray.
 */
export function PdfConverterWorkbenchSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="bg-card ring-border/70 flex flex-col gap-6 rounded-xl p-5 ring-1 ring-inset sm:p-6"
        >
            <div className="flex flex-col gap-5">
                {/* Source switch */}
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-10 w-60 rounded-xl" />
                </div>

                {/* Format switch, then the document box */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-10 w-64 rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="h-7 w-24 rounded-lg" />
                        </div>
                        <Skeleton className="h-44 w-full rounded-xl" />
                    </div>
                </div>
            </div>

            {/* The folded page options */}
            <Skeleton className="h-5 w-44" />

            {/* Summary strip, the button, in the result tray */}
            <div className="bg-muted/40 ring-border flex flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4">
                <Skeleton className="h-5 w-24" />
                <div className="flex flex-col gap-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3.5 w-72 max-w-full" />
                </div>
                <Skeleton className="h-9 w-36 rounded-lg" />
            </div>
        </div>
    );
}
