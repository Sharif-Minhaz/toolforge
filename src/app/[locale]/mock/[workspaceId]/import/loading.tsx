import { Skeleton } from "@/components/ui/skeleton";

/**
 * Matches the import page: header, the example shelf, two fields, the paste
 * box, the enforce switch, the buttons.
 */
export default function ImportLoading() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full max-w-md" />
                <Skeleton className="h-4 w-full" />
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-3 w-full max-w-sm" />
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Skeleton className="h-36 rounded-xl" />
                        <Skeleton className="h-36 rounded-xl" />
                        <Skeleton className="h-36 rounded-xl" />
                        <Skeleton className="h-36 rounded-xl" />
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                </div>
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-16 rounded-2xl" />
                <div className="flex gap-3">
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-9 w-24" />
                </div>
            </div>
        </div>
    );
}
