"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatClaimValue } from "../domain/claims";
import type { HeaderRow, PayloadRow, TimeClaimInsight, TimeClaimState } from "../types";

const STATE_TEXT: Record<TimeClaimState, string> = {
    valid: "text-[var(--color-success)]",
    expired: "text-destructive",
    notYetValid: "text-destructive",
    future: "text-brand-amber",
    stale: "text-brand-amber",
    malformed: "text-destructive",
};

type TimeBadgeProps = {
    insight: TimeClaimInsight;
    now: Date;
};

function TimeBadge({ insight, now }: TimeBadgeProps) {
    const t = useTranslations("jwt.timeStates");
    const format = useFormatter();

    if (insight.at === null) {
        return (
            <span className={cn("text-[0.6875rem] leading-[1.4]", STATE_TEXT.malformed)}>
                {t("malformed")}
            </span>
        );
    }

    return (
        <span className="flex flex-col gap-0.5 text-[0.6875rem] leading-[1.4]">
            {/* Tokens carry UTC seconds, so the instant is shown in UTC rather
                than shifted into a reader's zone and quietly disagreeing with
                whatever their server logs say. */}
            <span className="text-muted-foreground font-mono">
                {format.dateTime(insight.at, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                })}{" "}
                UTC
            </span>
            <span className={STATE_TEXT[insight.state]}>
                {t(insight.state)} · {format.relativeTime(insight.at, now)}
            </span>
        </span>
    );
}

type TableShellProps = {
    caption: string;
    nameHeading: string;
    valueHeading: string;
    meaningHeading: string;
    children: ReactNode;
};

function TableShell({
    caption,
    nameHeading,
    valueHeading,
    meaningHeading,
    children,
}: TableShellProps) {
    return (
        <div className="ring-border/70 min-w-0 overflow-x-auto rounded-lg ring-1 ring-inset">
            <table className="w-full min-w-120 border-collapse text-left text-[0.8125rem]">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="bg-muted/60">
                        <th scope="col" className="px-3 py-2 text-xs font-medium">
                            {nameHeading}
                        </th>
                        <th scope="col" className="px-3 py-2 text-xs font-medium">
                            {valueHeading}
                        </th>
                        <th scope="col" className="px-3 py-2 text-xs font-medium">
                            {meaningHeading}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-border/70 divide-y">{children}</tbody>
            </table>
        </div>
    );
}

const NAME_CELL = "text-primary px-3 py-2.5 align-top font-mono text-[0.8125rem] font-medium";
const VALUE_CELL = "px-3 py-2.5 align-top font-mono text-[0.8125rem] break-all whitespace-pre-wrap";
const MEANING_CELL = "text-muted-foreground px-3 py-2.5 align-top text-xs leading-normal";

export function HeaderClaimsTable({ rows }: { rows: readonly HeaderRow[] }) {
    const t = useTranslations("jwt.workbench");
    const tParams = useTranslations("jwt.headerParams");

    return (
        <TableShell
            caption={t("headerTableCaption")}
            nameHeading={t("colParameter")}
            valueHeading={t("colValue")}
            meaningHeading={t("colMeaning")}
        >
            {rows.map((row) => (
                <tr key={row.name}>
                    <th scope="row" className={NAME_CELL}>
                        {row.name}
                    </th>
                    <td className={VALUE_CELL}>{formatClaimValue(row.value)}</td>
                    <td className={MEANING_CELL}>
                        {row.parameter === null ? t("customEntry") : tParams(row.parameter)}
                    </td>
                </tr>
            ))}
        </TableShell>
    );
}

export function PayloadClaimsTable({ rows, now }: { rows: readonly PayloadRow[]; now: Date }) {
    const t = useTranslations("jwt.workbench");
    const tClaims = useTranslations("jwt.claims");

    return (
        <TableShell
            caption={t("payloadTableCaption")}
            nameHeading={t("colClaim")}
            valueHeading={t("colValue")}
            meaningHeading={t("colMeaning")}
        >
            {rows.map((row) => (
                <tr key={row.name}>
                    <th scope="row" className={NAME_CELL}>
                        {row.name}
                    </th>
                    <td className={VALUE_CELL}>
                        <span className="flex flex-col gap-1">
                            <span>{formatClaimValue(row.value)}</span>
                            {row.time !== null && <TimeBadge insight={row.time} now={now} />}
                        </span>
                    </td>
                    <td className={MEANING_CELL}>
                        {row.claim === null ? t("customEntry") : tClaims(row.claim)}
                    </td>
                </tr>
            ))}
        </TableShell>
    );
}
