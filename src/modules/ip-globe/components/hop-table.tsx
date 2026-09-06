"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useCountryName } from "@/modules/tools/components/use-country-name";
import type { Hop, HopStatus } from "../types";

/**
 * The route in words.
 *
 * Not a fallback for the globe — the equal half of it. Everything the canvas
 * conveys by position and colour is here as text, which is what makes the tool
 * usable without a pointer, without WebGL, and by anyone reading it through a
 * screen reader. Several findings are *only* here: a hop with no allocation
 * country has no dot to look at, and neither does one that timed out.
 */

/** Tone per status, so colour is never the only thing carrying the meaning. */
const STATUS_TONE: Record<HopStatus, string> = {
    located: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    no_country: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    private_range: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    timed_out: "bg-muted text-muted-foreground",
    unresolvable: "bg-muted text-muted-foreground",
    blocked_address: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

type HopTableProps = {
    hops: readonly Hop[];
};

export function HopTable({ hops }: HopTableProps) {
    const t = useTranslations("ipGlobe.table");
    const tStatus = useTranslations("ipGlobe.hopStatus");
    const format = useFormatter();
    const describeCountry = useCountryName();

    return (
        // Wide content scrolls inside its own box; the page never scrolls
        // sideways at 390 px.
        <div className="ring-border/70 overflow-x-auto rounded-xl ring-1 ring-inset">
            <table className="w-full min-w-[46rem] border-collapse text-left text-[0.8125rem]">
                <caption className="sr-only">{t("caption")}</caption>
                <thead>
                    <tr className="bg-card/70 text-muted-foreground text-[0.6875rem] tracking-[0.08em] uppercase">
                        <th scope="col" className="px-3 py-2 font-medium">
                            {t("hop")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                            {t("host")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                            {t("network")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                            {t("country")}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                            {t("rtt")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                            {t("status")}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {hops.map((hop) => {
                        const country = describeCountry(hop.address?.country ?? null);

                        return (
                            <tr key={hop.index} className="border-border/70 not-last:border-b">
                                <td className="text-muted-foreground px-3 py-2 tabular-nums">
                                    {format.number(hop.index)}
                                </td>
                                <td className="min-w-0 px-3 py-2">
                                    <span className="flex flex-col gap-0.5">
                                        <span className="font-medium break-all">
                                            {hop.hostname ?? hop.ip ?? t("unknownHost")}
                                        </span>
                                        {hop.hostname !== null && hop.ip !== null && (
                                            <span className="text-muted-foreground font-mono text-[0.6875rem] break-all">
                                                {hop.ip}
                                            </span>
                                        )}
                                        {hop.address?.reverse != null && (
                                            <span className="text-muted-foreground text-[0.6875rem] break-all">
                                                {hop.address.reverse}
                                            </span>
                                        )}
                                    </span>
                                </td>
                                <td className="min-w-0 px-3 py-2">
                                    {hop.address === null ? (
                                        <span className="text-muted-foreground">{t("none")}</span>
                                    ) : (
                                        <span className="flex flex-col gap-0.5">
                                            <span>
                                                {hop.address.org ?? hop.address.asName ?? t("none")}
                                            </span>
                                            {hop.address.asn !== null && (
                                                <span className="text-muted-foreground font-mono text-[0.6875rem]">
                                                    AS{hop.address.asn}
                                                    {hop.address.prefix === null
                                                        ? ""
                                                        : ` · ${hop.address.prefix}`}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    {country.name === null ? (
                                        <span className="text-muted-foreground">{t("none")}</span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5">
                                            {/* The flag is decoration: the name beside it is
                                                what carries the fact. */}
                                            <span aria-hidden="true">{country.flag}</span>
                                            <span className="leading-[1.3]">{country.name}</span>
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                    {hop.rttMs === null ? (
                                        <span className="text-muted-foreground">{t("none")}</span>
                                    ) : (
                                        t("milliseconds", { value: hop.rttMs })
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    <span
                                        className={cn(
                                            "inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] leading-[1.4] font-medium",
                                            STATUS_TONE[hop.status],
                                        )}
                                    >
                                        {tStatus(hop.status)}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
