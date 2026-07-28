"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import type { EpochRendering } from "../types";

/** Ordered coarse to fine, which is the order people scan for the one they need. */
const ROWS = ["seconds", "milliseconds", "microseconds", "nanoseconds"] as const;

type EpochPanelProps = {
    epochs: EpochRendering;
    /** ISO 8601 in UTC, the one string that belongs to no card in particular. */
    isoUtc: string;
    pending: boolean;
    copiedField: string | null;
    onCopy: (field: string, value: string) => void;
};

/**
 * The zone-independent half of the answer. Values stay in Western digits in
 * both locales — they mirror machine input, and a Bengali numeral pasted into a
 * shell is a bug, not a courtesy.
 */
export function EpochPanel({ epochs, isoUtc, pending, copiedField, onCopy }: EpochPanelProps) {
    const t = useTranslations("timestamp.workbench");

    const rows = [
        ...ROWS.map((unit) => ({ field: unit, label: t(`epoch.${unit}`), value: epochs[unit] })),
        { field: "isoUtc", label: t("epoch.isoUtc"), value: isoUtc },
    ];

    return (
        <dl
            className={cn(
                "grid gap-1.5 transition-opacity duration-200 sm:grid-cols-2",
                pending && "opacity-55",
            )}
        >
            {rows.map((row) => (
                <div
                    key={row.field}
                    className="bg-muted/45 ring-border/50 flex min-w-0 items-center gap-2 rounded-xl py-2 pr-1.5 pl-3 ring-1 ring-inset"
                >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <dt className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                            {row.label}
                        </dt>
                        <dd className="truncate font-mono text-[0.8125rem] leading-[1.4] tabular-nums">
                            {row.value}
                        </dd>
                    </div>
                    <IconCopyButton
                        copied={copiedField === row.field}
                        onClick={() => onCopy(row.field, row.value)}
                        aria-label={t("copyValue", { label: row.label })}
                    />
                </div>
            ))}
        </dl>
    );
}
