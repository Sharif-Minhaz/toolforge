"use client";

import { IconRefresh, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MAX_LOG_ROWS } from "../domain/constants";
import type { RequestLogRow } from "../types";

const CLOCK_TICK_MS = 15_000;

type LogTableProps = {
    rows: readonly RequestLogRow[];
    busy: boolean;
    onRefresh: () => void;
    onClear: () => void;
};

/**
 * The last fifty operations this server answered.
 *
 * A name, a type, a status, a cost and a duration — and deliberately **not the
 * query text**. The REST studio logs a method and a path, which are small and
 * say nothing the document does not already say; the GraphQL equivalent would be
 * the whole query document, which is largely the visitor's own field names
 * against their own data and already stored once. A second copy of that would
 * mean this service quietly keeps more than it says.
 *
 * `cost` is the column with no REST counterpart, and it is here because it is
 * the only thing that tells a 400 for "too costly" apart from a 400 for
 * "invalid". Without it the two are one number in a table and the fix for each
 * is completely different.
 *
 * The panel says all of that in its own copy rather than leaving the absence to
 * be noticed, because "the log is thin" and "the log is thin on purpose" are
 * different things to read.
 */
export function LogTable({ rows, busy, onRefresh, onClear }: LogTableProps) {
    const t = useTranslations("graphqlServer.logs");
    const format = useFormatter();

    // `relativeTime` needs an explicit reference instant, or next-intl reads the
    // host clock and warns — and a reference read per render would also mean the
    // server and the browser disagreed about "2 minutes ago". Reading it here is
    // safe because this table is only mounted once the logs tab is opened and the
    // rows have come back from a server action, so it never server-renders a row.
    const [now, setNow] = useState(() => new Date());

    // A log left open goes stale otherwise: "just now" stays "just now" for as
    // long as the tab is up.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);

        return () => window.clearInterval(timer);
    }, []);

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground max-w-[60ch] text-xs leading-relaxed">
                    {t("description", { max: MAX_LOG_ROWS })}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={busy}
                        onClick={onRefresh}
                    >
                        <IconRefresh className="size-3.5" stroke={1.9} aria-hidden="true" />
                        {t("refresh")}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        disabled={busy || rows.length === 0}
                        onClick={onClear}
                    >
                        <IconTrash className="size-3.5" stroke={1.9} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                </div>
            </div>

            {rows.length === 0 ? (
                <p className="border-border/70 text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-xs leading-relaxed">
                    {t("empty")}
                    <span className="text-muted-foreground/70 mt-1 block">{t("emptyHint")}</span>
                </p>
            ) : (
                <div className="border-border/70 min-w-0 overflow-x-auto rounded-2xl border">
                    <table className="w-full min-w-lg text-left text-xs">
                        <thead className="text-muted-foreground bg-muted/40">
                            <tr>
                                <th scope="col" className="px-3 py-2 font-medium">
                                    {t("operationColumn")}
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">
                                    {t("typeColumn")}
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">
                                    {t("statusColumn")}
                                </th>
                                <th scope="col" className="px-3 py-2 text-right font-medium">
                                    {t("costColumn")}
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">
                                    {t("whenColumn")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-border/70 not-last:border-b">
                                    <td className="text-foreground max-w-56 truncate px-3 py-2 align-top font-mono">
                                        {row.operationName ?? (
                                            <span className="text-muted-foreground/70 italic">
                                                {t("anonymous")}
                                            </span>
                                        )}
                                    </td>
                                    <td className="text-muted-foreground px-3 py-2 align-top font-mono">
                                        {row.operationType}
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <span
                                            className={cn(
                                                "font-mono tabular-nums",
                                                row.status >= 500
                                                    ? "text-destructive"
                                                    : row.status >= 400
                                                      ? "text-brand-amber"
                                                      : "text-brand-emerald",
                                            )}
                                        >
                                            {row.status}
                                        </span>
                                    </td>
                                    {/*
                                        Through the formatter, so Bangla renders
                                        Bengali numerals — a cost reads as prose
                                        rather than as machine input.
                                    */}
                                    <td className="text-muted-foreground px-3 py-2 text-right align-top tabular-nums">
                                        {format.number(row.cost)}
                                    </td>
                                    <td className="text-muted-foreground px-3 py-2 align-top whitespace-nowrap tabular-nums">
                                        {format.relativeTime(new Date(row.createdAt), now)}
                                        <span className="text-muted-foreground/70 ml-1.5">
                                            {t("durationValue", { ms: row.durationMs })}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
