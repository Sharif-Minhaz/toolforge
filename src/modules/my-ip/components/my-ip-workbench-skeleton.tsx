import { Skeleton } from "@/components/ui/skeleton";
import { RESULT_TRAY } from "@/modules/tools/components/workbench-step";
import { REQUEST_FIELDS } from "../types";
import { REPORT_CARD } from "./my-ip-report";

function DetailRowsSkeleton({ rows }: { rows: number }) {
    return (
        <div aria-hidden="true" className={RESULT_TRAY}>
            <Skeleton className="h-5 w-40" />
            <div className="flex flex-col gap-3">
                {Array.from({ length: rows }, (_, index) => (
                    <div key={index} className="flex gap-3">
                        <Skeleton className="h-4 w-28 shrink-0 sm:w-40" />
                        <Skeleton className="h-4 flex-1" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** The network panel while its DNS lookups stream in. Six facts. */
export function NetworkPanelSkeleton() {
    return <DetailRowsSkeleton rows={6} />;
}

/**
 * The report card while it waits: the fallback for the request-time half of
 * the page, and the matching block in `loading.tsx`. Address, then the two
 * panels side by side from `lg`.
 */
export function MyIpWorkbenchSkeleton() {
    return (
        <div aria-hidden="true" className={REPORT_CARD}>
            <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-8 w-56 sm:h-10 sm:w-72" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <DetailRowsSkeleton rows={REQUEST_FIELDS.length} />
                <NetworkPanelSkeleton />
            </div>
        </div>
    );
}

/** The terminal card, for `loading.tsx`. */
export function MyIpCommandLineSkeleton() {
    return (
        <div aria-hidden="true" className={REPORT_CARD}>
            <Skeleton className="h-5 w-36" />
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-full max-w-md" />
                <Skeleton className="h-4 w-full max-w-lg" />
            </div>
        </div>
    );
}
