"use client";

import { IconChevronDown, IconChevronRight, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

import { clearLogs, getRequestLogs } from "../actions/logs";
import { MAX_LOG_SEARCH_LENGTH } from "../domain/constants";
import { LOG_RETENTION_DAYS, MAX_LOGS_PER_WORKSPACE, statusTone } from "../domain/log-record";
import type { RequestLogRow } from "../types";

type LogTableProps = {
    workspaceId: string;
    initialRows: readonly RequestLogRow[];
};

const TONE_CLASS = {
    success: "text-[var(--color-success)]",
    warning: "text-brand-amber",
    error: "text-destructive",
} as const;

/**
 * The request log.
 *
 * Search is debounced at 300 ms, because it round-trips to the database on
 * every keystroke otherwise — the site-wide rule for typed input. The refresh
 * and clear buttons are discrete actions and stay instant.
 *
 * A row expands in place rather than opening a panel: the interesting part of a
 * log line is its body, and a body is tall, so a modal would put it behind a
 * scroll the reader cannot compare against the row above.
 */
export function LogTable({ workspaceId, initialRows }: LogTableProps) {
    const t = useTranslations("mockServer.logs");
    const format = useFormatter();
    const searchId = useId();

    const [rows, setRows] = useState<readonly RequestLogRow[]>(initialRows);
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const debouncedSearch = useDebouncedValue(search, 300);

    function reload(term = debouncedSearch) {
        startTransition(async () => {
            setRows(await getRequestLogs({ workspaceId, search: term || undefined }));
        });
    }

    function clear() {
        startTransition(async () => {
            const result = await clearLogs({ workspaceId });

            if (result.ok) {
                setRows([]);
                toast.success(t("cleared"));
            }
        });
    }

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Label htmlFor={searchId} className="text-xs">
                        {t("searchLabel")}
                    </Label>
                    <Input
                        id={searchId}
                        type="search"
                        // The same 200 the list action bounds it at, so a long
                        // paste is refused by the box rather than by the server.
                        maxLength={MAX_LOG_SEARCH_LENGTH}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                reload(search);
                            }
                        }}
                        placeholder={t("searchPlaceholder")}
                        className="max-w-md"
                    />
                </div>

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={pending}
                    onClick={() => reload()}
                >
                    <IconRefresh className="size-4" aria-hidden="true" />
                    {t("refresh")}
                </Button>

                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive gap-1.5"
                    disabled={pending || rows.length === 0}
                    onClick={clear}
                >
                    <IconTrash className="size-3.5" aria-hidden="true" />
                    {t("clear")}
                </Button>
            </div>

            <p className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                {t("retention", { max: MAX_LOGS_PER_WORKSPACE, days: LOG_RETENTION_DAYS })}
            </p>

            {rows.length === 0 ? (
                <p className="border-border/70 text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-xs leading-relaxed">
                    {t("empty")}
                    <span className="text-muted-foreground/70 mt-1 block">{t("emptyHint")}</span>
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {rows.map((row) => {
                        const open = expanded === row.id;

                        return (
                            <li
                                key={row.id}
                                className="border-border/70 bg-card min-w-0 rounded-xl border"
                            >
                                <button
                                    type="button"
                                    aria-expanded={open}
                                    onClick={() => setExpanded(open ? null : row.id)}
                                    className="focus-visible:ring-ring flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
                                >
                                    {open ? (
                                        <IconChevronDown
                                            className="text-muted-foreground size-3.5 shrink-0"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <IconChevronRight
                                            className="text-muted-foreground size-3.5 shrink-0"
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span
                                        className={cn(
                                            "w-12 shrink-0 font-mono text-[0.625rem] font-semibold tabular-nums",
                                            TONE_CLASS[statusTone(row.status)],
                                        )}
                                    >
                                        {row.status}
                                    </span>
                                    <span className="text-muted-foreground w-14 shrink-0 font-mono text-[0.625rem] font-semibold">
                                        {row.method}
                                    </span>
                                    <span className="text-foreground min-w-0 flex-1 truncate font-mono text-xs">
                                        {row.path}
                                    </span>
                                    {/* Western digits: a duration mirrors machine
                                        output, so it is not prose. */}
                                    <span className="text-muted-foreground shrink-0 font-mono text-[0.625rem] tabular-nums">
                                        {row.durationMs}ms
                                    </span>
                                    <span className="text-muted-foreground hidden shrink-0 text-[0.625rem] sm:inline">
                                        {format.dateTime(new Date(row.createdAt), {
                                            timeStyle: "medium",
                                        })}
                                    </span>
                                </button>

                                {open ? (
                                    <div className="border-border/60 flex min-w-0 flex-col gap-3 border-t px-3 py-3">
                                        <Section title={t("requestHeaders")}>
                                            <KeyValues values={row.request.headers} />
                                        </Section>

                                        {Object.keys(row.request.query).length > 0 ? (
                                            <Section title={t("query")}>
                                                <KeyValues values={row.request.query} />
                                            </Section>
                                        ) : null}

                                        {row.request.bodyPreview !== "" ? (
                                            <Section
                                                title={t("requestBody")}
                                                note={
                                                    row.request.bodyTruncated
                                                        ? t("truncated")
                                                        : undefined
                                                }
                                            >
                                                <Pre>{row.request.bodyPreview}</Pre>
                                            </Section>
                                        ) : null}

                                        <Section
                                            title={t("responseBody")}
                                            note={
                                                row.response.bodyTruncated
                                                    ? t("truncated")
                                                    : undefined
                                            }
                                        >
                                            <Pre>{row.response.bodyPreview}</Pre>
                                        </Section>

                                        {row.trace !== null && row.trace.nodes.length > 0 ? (
                                            <Section title={t("trace")}>
                                                <ol className="flex flex-wrap items-center gap-1">
                                                    {row.trace.nodes.map((entry, index) => (
                                                        <li
                                                            key={`${entry.nodeId}-${index}`}
                                                            className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 font-mono text-[0.625rem]"
                                                        >
                                                            {entry.kind}
                                                        </li>
                                                    ))}
                                                </ol>
                                            </Section>
                                        ) : null}

                                        {row.trace !== null && row.trace.log.length > 0 ? (
                                            <Section title={t("logLines")}>
                                                <Pre>
                                                    {row.trace.log
                                                        .map(
                                                            (line) =>
                                                                `[${line.level}] ${line.message}`,
                                                        )
                                                        .join("\n")}
                                                </Pre>
                                            </Section>
                                        ) : null}
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function Section({
    title,
    note,
    children,
}: {
    title: string;
    note?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <p className="text-muted-foreground text-[0.625rem] font-semibold tracking-[0.09em] uppercase">
                {title}
                {note !== undefined ? (
                    <span className="text-brand-amber ml-1.5 normal-case">{note}</span>
                ) : null}
            </p>
            {children}
        </div>
    );
}

function KeyValues({ values }: { values: Readonly<Record<string, string>> }) {
    return (
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            {Object.entries(values).map(([name, value]) => (
                <div key={name} className="contents">
                    <dt className="text-muted-foreground font-mono text-[0.6875rem]">{name}</dt>
                    <dd className="text-foreground truncate font-mono text-[0.6875rem]">{value}</dd>
                </div>
            ))}
        </dl>
    );
}

function Pre({ children }: { children: React.ReactNode }) {
    return (
        <pre className="bg-muted/50 text-foreground max-h-56 min-w-0 overflow-auto rounded-lg p-2 font-mono text-[0.6875rem] whitespace-pre-wrap">
            {children}
        </pre>
    );
}
