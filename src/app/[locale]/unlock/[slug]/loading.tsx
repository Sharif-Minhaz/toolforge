import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the gate: one narrow card with an icon, a heading and one field. */
export default function UnlockLoading() {
    return (
        <div className="flex w-full max-w-md flex-col gap-6" aria-hidden="true">
            <div className="bg-card ring-border/70 flex flex-col gap-5 rounded-2xl p-6 ring-1 ring-inset sm:p-7">
                <div className="flex flex-col gap-2">
                    <Skeleton className="size-9 rounded-xl" />
                    <Skeleton className="h-6 w-56" />
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-9 w-full rounded-xl" />
                </div>

                <Skeleton className="h-9 w-28 rounded-xl" />
                <Skeleton className="h-3 w-full max-w-[52ch]" />
            </div>
        </div>
    );
}
