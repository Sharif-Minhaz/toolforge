"use client";

import { IconAlertTriangle, IconLock } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useByteLabel } from "@/modules/tools/components/byte-size";

import type { ServerUsage } from "../types";

type UsageBarProps = {
    usage: ServerUsage;
    /** The full explanation, for the workbench. Off in the list, where a row is a summary. */
    verbose?: boolean;
    className?: string;
};

/**
 * How full a server is, and what happens at the top.
 *
 * The bar has three states rather than two, and the middle one is the reason it
 * exists at all. A limit somebody meets with no warning reads as a fault in the
 * tool; at 80% the bar changes tone and the copy names the number, so the lock
 * is something they saw coming.
 *
 * When it does lock, the copy has to say **which** methods stopped — writes, not
 * reads — and **what to do**, which is delete a record. A message that only says
 * "full" leaves somebody with a server they think is broken; the way out is the
 * whole point, because `DELETE` is deliberately still open.
 */
export function UsageBar({ usage, verbose = false, className }: UsageBarProps) {
    const t = useTranslations("jsonServer.usage");
    const byteLabel = useByteLabel();

    const tone = usage.full
        ? "bg-destructive"
        : usage.nearLimit
          ? "bg-brand-amber"
          : "bg-brand-emerald";

    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.3] tabular-nums">
                    {t("used", { used: byteLabel(usage.bytes), limit: byteLabel(usage.limit) })}
                </p>
                <p
                    className={cn(
                        "text-[0.6875rem] leading-[1.3] tabular-nums",
                        usage.full
                            ? "text-destructive"
                            : usage.nearLimit
                              ? "text-brand-amber"
                              : "text-muted-foreground",
                    )}
                >
                    {t("percent", { percent: usage.percent })}
                </p>
            </div>

            {/*
                A real progressbar, not a decorated div: the number is the point
                and a screen reader gets nothing from a coloured rectangle.
            */}
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={usage.percent}
                aria-label={t("label")}
                className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            >
                <div
                    className={cn("h-full rounded-full transition-[width] duration-300", tone)}
                    style={{ width: `${Math.max(usage.percent, usage.bytes > 0 ? 2 : 0)}%` }}
                />
            </div>

            {usage.full ? (
                <p className="text-destructive flex items-start gap-1.5 text-[0.6875rem] leading-normal">
                    <IconLock className="mt-px size-3.5 shrink-0" stroke={2} aria-hidden="true" />
                    {verbose ? t("fullVerbose") : t("full")}
                </p>
            ) : usage.nearLimit ? (
                <p className="text-brand-amber flex items-start gap-1.5 text-[0.6875rem] leading-normal">
                    <IconAlertTriangle
                        className="mt-px size-3.5 shrink-0"
                        stroke={2}
                        aria-hidden="true"
                    />
                    {t("near", { remaining: byteLabel(usage.limit - usage.bytes) })}
                </p>
            ) : null}
        </div>
    );
}
