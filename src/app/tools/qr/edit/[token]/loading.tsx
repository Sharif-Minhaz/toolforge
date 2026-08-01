import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the edit page: breadcrumb, heading, then the single card. */
export default function DynamicQrEditLoading() {
    return (
        <div className="flex flex-col gap-8" aria-hidden="true">
            <div className="flex flex-col gap-4">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-8 w-64 sm:h-9" />
            </div>

            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-72" />
                </div>

                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-3 w-64" />
                </div>

                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                    <Skeleton className="h-3 w-56" />
                </div>

                <Skeleton className="h-9 w-32 rounded-xl" />

                <div className="grid gap-2 border-t pt-4 sm:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
