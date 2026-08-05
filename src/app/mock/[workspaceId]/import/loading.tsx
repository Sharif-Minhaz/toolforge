import { Skeleton } from "@/components/ui/skeleton";

/** Matches the import page: header, two fields, the paste box, the button. */
export default function ImportLoading() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full max-w-md" />
                <Skeleton className="h-4 w-full max-w-2xl" />
            </div>

            <div className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                </div>
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-9 w-40" />
            </div>
        </div>
    );
}
