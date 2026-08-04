"use client";

import { IconCircleCheck, IconCircleMinus, IconCircleX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { sortResults } from "../domain/summary";
import type { PortResult, PortState } from "../types";

/**
 * Three tones, and only one of them is a finding.
 *
 * `open` is the answer somebody ran the scan for, so it carries the accent.
 * `filtered` is amber because it is genuinely ambiguous — nothing answered — and
 * `closed` is deliberately the quietest of the three: on a 128-port scan it is
 * a hundred rows of "nothing here", and painting those red would drown the two
 * rows that matter.
 */
const STATE_STYLE: Readonly<
    Record<PortState, { dot: string; text: string; Icon: typeof IconCircleCheck }>
> = {
    open: {
        dot: "bg-[var(--color-success)]",
        text: "text-[var(--color-success)]",
        Icon: IconCircleCheck,
    },
    filtered: { dot: "bg-brand-amber", text: "text-brand-amber", Icon: IconCircleMinus },
    closed: {
        dot: "bg-muted-foreground/50",
        text: "text-muted-foreground",
        Icon: IconCircleX,
    },
};

type ResultsTableProps = {
    results: readonly PortResult[];
};

export function ResultsTable({ results }: ResultsTableProps) {
    const t = useTranslations("portScanner.workbench");
    const tStates = useTranslations("portScanner.states");

    return (
        <div className="ring-border/80 overflow-x-auto rounded-xl ring-1 ring-inset">
            <table className="w-full min-w-140 border-collapse text-left text-sm">
                <caption className="sr-only">{t("resultsTitle")}</caption>
                <thead>
                    <tr className="bg-muted/60">
                        <th scope="col" className="px-4 py-2.5 font-medium">
                            {t("colPort")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                            {t("colService")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                            {t("colState")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">
                            {t("colLatency")}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-border/70 divide-y">
                    {sortResults(results).map((result) => {
                        const style = STATE_STYLE[result.state];

                        return (
                            <tr key={result.port} className="align-middle">
                                <th
                                    scope="row"
                                    className="px-4 py-2.5 font-mono text-[0.8125rem] font-medium tabular-nums"
                                >
                                    {result.port}
                                </th>
                                <td
                                    className={cn(
                                        "px-4 py-2.5 text-[0.8125rem]",
                                        result.service === null
                                            ? "text-muted-foreground/60 italic"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {result.service ?? t("noService")}
                                </td>
                                <td className="px-4 py-2.5">
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1.5 text-[0.8125rem] font-medium",
                                            style.text,
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={cn("size-1.5 rounded-full", style.dot)}
                                        />
                                        <span className="leading-[1.3]">
                                            {tStates(result.state)}
                                        </span>
                                    </span>
                                </td>
                                <td className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[0.75rem] tabular-nums">
                                    {result.latencyMs === null
                                        ? t("noLatency")
                                        : t("latencyMs", { value: result.latencyMs })}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
