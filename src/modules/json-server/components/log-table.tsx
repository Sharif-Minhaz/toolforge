"use client";

import { IconRefresh, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { RequestLogRow } from "../types";

const CLOCK_TICK_MS = 15_000;

type LogTableProps = {
    rows: readonly RequestLogRow[];
    busy: boolean;
    onRefresh: () => void;
    onClear: () => void;
};

/**
 * The last fifty calls this server answered.
 *
 * Method, path, status, duration — and deliberately no headers and no bodies.
 * The Mock Server Studio logs those because an author is debugging what a client
 * sent them; here the request bodies **are** the visitor's data, already stored
 * once in the document, and a second redacted copy would mean this service
 * quietly keeps more than it says. What is left still answers the question
 * people actually have, which is why a client got a 404.
 *
 * The panel says so rather than leaving the absence to be noticed, because "the
 * log is thin" and "the log is thin on purpose" are different things to read.
 */
export function LogTable({ rows, busy, onRefresh, onClear }: LogTableProps) {
    const t = useTranslations("jsonServer.logs");
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
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground max-w-[60ch] text-xs leading-relaxed">
                    {t("description")}
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
                </p>
            ) : (
                <div className="border-border/70 overflow-x-auto rounded-2xl border">
                    <table className="w-full min-w-104 text-left text-xs">
                        <thead className="text-muted-foreground bg-muted/40">
                            <tr>
                                <th scope="col" className="px-3 py-2 font-medium">
                                    {t("method")}
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">
                                    {t("path")}
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">
                                    {t("status")}
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">
                                    {t("when")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-border/70 not-last:border-b">
                                    <td className="text-foreground px-3 py-2 align-top font-mono">
                                        {row.method}
                                    </td>
                                    <td className="text-muted-foreground max-w-64 truncate px-3 py-2 align-top font-mono">
                                        {row.path}
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
                                    <td className="text-muted-foreground px-3 py-2 align-top whitespace-nowrap tabular-nums">
                                        {/*
                                            Both go through the formatter, so
                                            Bangla renders Bengali numerals —
                                            these read as prose, not as machine
                                            input.
                                        */}
                                        {format.relativeTime(new Date(row.createdAt), now)}
                                        <span className="text-muted-foreground/70 ml-1.5">
                                            {t("duration", { ms: row.durationMs })}
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
