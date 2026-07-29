"use client";

import { IconMapPin, IconSun, IconWorld, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { getTimeZoneCity } from "@/modules/tools/domain/time-zones";
import type { ZonedRendering, ZoneRole } from "../types";

const ROLE_ICON = {
    local: IconMapPin,
    utc: IconWorld,
    pinned: IconWorld,
} as const;

type ZoneCardProps = {
    rendering: ZonedRendering;
    role: ZoneRole;
    /** True while the debounced input has yet to reach the converter. */
    pending: boolean;
    copiedField: string | null;
    onCopy: (field: string, value: string) => void;
    onRemove?: () => void;
};

/**
 * One instant told in one zone, in the order a person reads it: the clock
 * first, then the date, then the zone's own labels, then the two strings a
 * machine reads.
 *
 * The clock is the whole point of the card and it used to be a fragment of one
 * long sentence — `fullDate` renders as "Wednesday, 29 July 2026 at 18:00:00",
 * so the number anyone actually came for sat at the end of a line of prose, at
 * the same weight as everything around it. Splitting it into `timeOnly` and
 * `weekday`/`dateOnly` costs nothing: the renderer already produced all three.
 */
export function ZoneCard({
    rendering,
    role,
    pending,
    copiedField,
    onCopy,
    onRemove,
}: ZoneCardProps) {
    const t = useTranslations("timestamp.workbench");
    const Icon = ROLE_ICON[role];
    const title = role === "local" ? t("localZone") : getTimeZoneCity(rendering.timeZone);

    const machineRows = [
        { field: "iso", label: t("iso8601"), value: rendering.iso8601 },
        { field: "rfc", label: t("rfc2822"), value: rendering.rfc2822 },
    ];

    return (
        <div
            className={cn(
                "bg-card ring-border/70 relative flex min-w-0 flex-col gap-3 rounded-2xl p-4 ring-1 ring-inset",
                "transition-opacity duration-200",
                pending && "opacity-55",
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                        <Icon
                            className="text-primary size-3.5 shrink-0"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        <span className="truncate text-[0.8125rem] leading-[1.3] font-medium">
                            {title}
                        </span>
                    </span>
                    <span className="text-muted-foreground truncate font-mono text-[0.6875rem] leading-[1.4]">
                        {rendering.timeZone}
                    </span>
                </div>

                {onRemove !== undefined && (
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label={t("removeZone", { zone: getTimeZoneCity(rendering.timeZone) })}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <IconX className="size-3.5" stroke={2} aria-hidden="true" />
                    </button>
                )}
            </div>

            <div className="flex min-w-0 flex-col gap-0.5">
                {/* `timeOnly` is locale-formatted, so Bangla renders Bengali
                    numerals here — the line height has to clear their ascenders. */}
                <p className="truncate font-mono text-2xl leading-[1.35] tabular-nums">
                    {rendering.timeOnly}
                </p>
                {/* `dateOnly` is `dateStyle: "full"`, which already opens with
                    the weekday — prefixing `weekday` here printed it twice. */}
                <p className="text-[0.8125rem] leading-[1.45] wrap-break-word">
                    {rendering.dateOnly}
                </p>
                {rendering.zoneName.length > 0 && (
                    <p
                        title={rendering.zoneName}
                        className="text-muted-foreground truncate text-[0.75rem] leading-[1.45]"
                    >
                        {rendering.zoneName}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="font-mono text-[0.6875rem] leading-[1.3]">
                    {rendering.offsetLabel === "Z" ? "+00:00" : rendering.offsetLabel}
                </Badge>
                {rendering.abbreviation.length > 0 && (
                    <Badge variant="outline" className="text-[0.6875rem] leading-[1.3]">
                        {rendering.abbreviation}
                    </Badge>
                )}
                {rendering.inDaylightTime && (
                    <Badge
                        variant="outline"
                        // Bengali ascenders overflow the badge's fixed height.
                        className="text-brand-amber border-brand-amber/35 h-auto gap-1 py-0.5 text-[0.6875rem] leading-[1.3]"
                    >
                        <IconSun className="size-3" stroke={2} aria-hidden="true" />
                        {t("daylightTime")}
                    </Badge>
                )}
            </div>

            <dl className="flex flex-col gap-1">
                {machineRows.map((row) => (
                    <div
                        key={row.field}
                        className="bg-muted/45 flex min-w-0 items-center gap-1 rounded-lg py-1 pr-1 pl-2.5"
                    >
                        <dt className="sr-only">{row.label}</dt>
                        <dd className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] leading-normal">
                            {row.value}
                        </dd>
                        <IconCopyButton
                            copied={copiedField === `${rendering.timeZone}:${row.field}`}
                            onClick={() => onCopy(`${rendering.timeZone}:${row.field}`, row.value)}
                            aria-label={t("copyValue", { label: row.label })}
                            className="size-6"
                        />
                    </div>
                ))}
            </dl>
        </div>
    );
}
