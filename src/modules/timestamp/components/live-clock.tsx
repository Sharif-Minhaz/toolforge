"use client";

import { IconClockHour4, IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

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
 * What the Unix clock says right now, as a pill that sits beside the input's
 * label rather than as a band above it — it is a shortcut, and giving it a
 * full-width panel of its own made it read as a result.
 *
 * The value is a prop rather than local state, because the same `now` also
 * drives "3 days from today" further down the page; two independent clocks
 * would drift apart within a second of each other.
 *
 * The readout is itself the button that fills the field. That is the only
 * thing anyone ever does with it, so making them aim at a separate control was
 * a step for nothing.
 */
export function LiveClock({ nowMs, running, copied, onToggle, onCopy, onUse }: LiveClockProps) {
    const t = useTranslations("timestamp.workbench");
    const seconds = String(Math.floor(nowMs / 1000));

    return (
        <div className="flex items-center gap-0.5">
            <button
                type="button"
                onClick={() => onUse(seconds)}
                title={t("useNow")}
                aria-label={t("useNow")}
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring ring-border/70 flex h-7 items-center gap-1.5 rounded-lg px-2 ring-1 transition-colors duration-200 ring-inset focus-visible:ring-2 focus-visible:outline-none"
            >
                <IconClockHour4 className="size-3.5 shrink-0" stroke={1.8} aria-hidden="true" />
                <span
                    // `role="timer"` without a live region: a screen reader
                    // announcing a new number every second would be unusable.
                    role="timer"
                    aria-label={t("nowLabel")}
                    className="font-mono text-[0.6875rem] leading-[1.4] tabular-nums"
                >
                    {seconds}
                </span>
            </button>

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
    );
}
