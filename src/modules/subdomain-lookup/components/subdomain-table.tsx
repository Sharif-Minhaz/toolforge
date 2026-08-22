"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { SubdomainRecord } from "../types";

/**
 * One page of names.
 *
 * Given a page rather than the whole result on purpose — the paging arithmetic
 * is in `domain/list.ts`, tested, and this component's only job is to render
 * what it is handed. That also means it never sees the twenty thousand rows the
 * cap allows, which is the point.
 *
 * The name column carries `wrap-break-word` and the table a `min-w-0` ancestor:
 * a hostname has no spaces, and a fifty-label name would otherwise push the
 * page wider than a phone at 390 px.
 */

type SubdomainTableProps = {
    records: readonly SubdomainRecord[];
    apex: string;
};

export function SubdomainTable({ records, apex }: SubdomainTableProps) {
    const t = useTranslations("subdomainLookup.workbench");
    const format = useFormatter();

    return (
        <div className="ring-border/80 overflow-x-auto rounded-xl ring-1 ring-inset">
            <table className="w-full min-w-120 border-collapse text-left text-sm">
                <caption className="sr-only">{t("tableCaption", { apex })}</caption>
                <thead>
                    <tr className="bg-muted/60">
                        <th scope="col" className="px-4 py-2.5 font-medium">
                            {t("colName")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">
                            {t("colDepth")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">
                            {t("colFirstSeen")}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-border/70 divide-y">
                    {records.map((record) => (
                        <tr key={record.name} className="align-middle">
                            <th
                                scope="row"
                                className="max-w-0 px-4 py-2.5 font-mono text-[0.8125rem] font-medium wrap-break-word"
                            >
                                {record.name}
                                {record.label === null && (
                                    <span className="text-muted-foreground/70 ml-2 font-sans text-[0.6875rem] leading-[1.3] font-normal">
                                        {t("apexRow")}
                                    </span>
                                )}
                            </th>
                            <td className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[0.75rem] tabular-nums">
                                {format.number(record.depth)}
                            </td>
                            <td
                                className={cn(
                                    "px-4 py-2.5 text-right text-[0.75rem] tabular-nums",
                                    record.firstSeen === null
                                        ? "text-muted-foreground/60 italic"
                                        : "text-muted-foreground",
                                )}
                            >
                                {record.firstSeen === null ? (
                                    t("undated")
                                ) : (
                                    // A date, not an instant. The index's own
                                    // precision on the older sources is a day —
                                    // several carry midnight exactly — so
                                    // printing a time would be inventing one.
                                    <time dateTime={record.firstSeen}>
                                        {format.dateTime(new Date(record.firstSeen), {
                                            dateStyle: "medium",
                                            timeZone: "UTC",
                                        })}
                                    </time>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
