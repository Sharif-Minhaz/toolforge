"use client";

import { IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { IconCopyButton } from "@/modules/tools/components/copy-button";

type LiveClockProps = {
    /** Current instant, ticked by the workbench so one clock drives everything. */
    nowMs: number;
    running: boolean;
    copied: boolean;
    onToggle: () => void;
    onCopy: (value: string) => void;
    onUse: (value: string) => void;
};

/**
 * The line the reference tools open with: what the Unix clock says right now.
 *
 * The value is a prop rather than local state, because the same `now` also
 * drives "3 days from today" further down the page — two independent clocks
 * would drift apart within a second of each other.
 */
export function LiveClock({ nowMs, running, copied, onToggle, onCopy, onUse }: LiveClockProps) {
    const t = useTranslations("timestamp.workbench");
    const seconds = String(Math.floor(nowMs / 1000));

    return (
        <div className="bg-muted/40 ring-border/60 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 ring-1 ring-inset">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                    {t("nowLabel")}
                </span>
                <span
                    // `role="timer"` without a live region: a screen reader
                    // announcing a new number every second would be unusable.
                    role="timer"
                    aria-label={t("nowLabel")}
                    className="truncate font-mono text-lg leading-[1.3] tabular-nums"
                >
                    {seconds}
                </span>
            </div>

            <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => onUse(seconds)}>
                    {t("useNow")}
                </Button>
                <IconCopyButton
                    copied={copied}
                    onClick={() => onCopy(seconds)}
                    aria-label={t("copyValue", { label: t("nowLabel") })}
                />
                <button
                    type="button"
                    onClick={onToggle}
                    aria-pressed={!running}
                    aria-label={running ? t("pauseClock") : t("resumeClock")}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                >
                    {running ? (
                        <IconPlayerPause className="size-4" stroke={1.8} aria-hidden="true" />
                    ) : (
                        <IconPlayerPlay className="size-4" stroke={1.8} aria-hidden="true" />
                    )}
                </button>
            </div>
        </div>
    );
}
