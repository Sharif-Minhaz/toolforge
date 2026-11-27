import { Skeleton } from "@/components/ui/skeleton";

/**
 * A labelled `SegmentedControl` above a workbench, with its hint, while it
 * waits. Shared by the testers that put two modes behind one switch.
 */
export function ModeSwitchSkeleton() {
    return (
        <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-12 w-full max-w-md rounded-xl" />
            <Skeleton className="h-3 w-72 max-w-full" />
        </div>
    );
}
