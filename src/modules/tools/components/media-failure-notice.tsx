"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { MediaKind } from "../domain/media-devices";
import type { MediaFailure } from "../domain/media-failure";

type MediaFailureNoticeProps = {
    kind: MediaKind;
    failure: MediaFailure;
    className?: string;
};

/** Why the device did not start and what to do about it, in the place its picture would have been. */
export function MediaFailureNotice({ kind, failure, className }: MediaFailureNoticeProps) {
    const t = useTranslations("mediaDevices.failures");

    return (
        <div
            role="status"
            className={cn(
                "bg-card ring-destructive/30 flex max-w-md items-start gap-2.5 rounded-xl p-3 text-left ring-1 ring-inset",
                className,
            )}
        >
            <IconAlertTriangle
                className="text-destructive mt-0.5 size-4 shrink-0"
                stroke={1.8}
                aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[0.8125rem] leading-[1.4] font-medium">
                    {t(`${failure}.title`, { kind })}
                </span>
                <span className="text-muted-foreground text-[0.75rem] leading-5">
                    {t(`${failure}.body`, { kind })}
                </span>
            </div>
        </div>
    );
}
