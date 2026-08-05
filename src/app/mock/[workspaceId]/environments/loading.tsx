import { Skeleton } from "@/components/ui/skeleton";

/** Matches the environments page: header, picker, rows, then the add card. */
export default function EnvironmentsLoading() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full max-w-sm" />
                <Skeleton className="h-4 w-full max-w-2xl" />
            </div>

            <div className="flex flex-col gap-5">
                <Skeleton className="h-9 w-40" />
                <div className="flex flex-col gap-1.5">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-10 rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-64 rounded-2xl" />
            </div>
        </div>
    );
}
