import { Skeleton } from "@/components/ui/skeleton";

/** Matches the server page: header with its address, then the two-column bench. */
export default function ServerLoading() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full max-w-md" />
                <Skeleton className="h-9 w-full max-w-2xl rounded-xl" />
                <Skeleton className="h-4 w-full max-w-xl" />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-10 rounded-xl" />
                    <Skeleton className="h-10 rounded-xl" />
                    <Skeleton className="h-10 rounded-xl" />
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-[32rem] rounded-2xl" />
                </div>
            </div>
        </div>
    );
}
