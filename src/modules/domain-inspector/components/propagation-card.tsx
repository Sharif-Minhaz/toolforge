"use client";

import { IconWorldPin } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Chip, PanelUnavailable, type ChipTone } from "./panel-card";
import { useCountryName } from "./use-country-name";
import { WorldMap, type MapPin } from "./world-map";
import { clusterByCountry, propagationTone } from "../domain/propagation";
import type { DomainReport, PropagationNodeResult, PropagationState } from "../types";

/**
 * "Is the change live yet?" — the one question this section answers.
 *
 * It sits full-width above the multicol panels rather than inside them for two
 * reasons: a map in a half-width column is a postage stamp, and the verdict is
 * the headline of the whole report. The signal strip stays at six readings; a
 * seventh would leave a hole in its `gap-px` grid, and this reading is a figure
 * plus a list of addresses rather than the single value that strip is built for.
 *
 * The map is decorative in the strict sense: every pin's content is also a row
 * in the list beneath it, so nothing here is reachable only by hovering.
 */

const STATE_TONES: Record<PropagationState, ChipTone> = {
    agreed: "good",
    // Divergence is what a correct change looks like while it spreads.
    differs: "warn",
    empty: "neutral",
    unreachable: "idle",
};

const VERDICT_TEXT = {
    good: "text-[color-mix(in_oklch,var(--brand-emerald)_78%,var(--foreground))]",
    warn: "text-[color-mix(in_oklch,var(--brand-amber)_72%,var(--foreground))]",
    idle: "text-muted-foreground",
} as const;

const VERDICT_RULE = {
    good: "bg-[color-mix(in_oklch,var(--brand-emerald)_70%,transparent)]",
    warn: "bg-[color-mix(in_oklch,var(--brand-amber)_70%,transparent)]",
    idle: "bg-border",
} as const;

const LABEL = "text-muted-foreground text-[0.625rem] leading-normal tracking-[0.14em] uppercase";

export function PropagationCard({ propagation }: { propagation: DomainReport["propagation"] }) {
    const t = useTranslations("domainInspector.propagation");
    const tStates = useTranslations("domainInspector.propagationStates");
    const describeCountry = useCountryName();

    if (!propagation.ok) {
        return (
            <section className="bg-card ring-border/70 flex min-w-0 flex-col overflow-hidden rounded-2xl ring-1 ring-inset">
                <Header title={t("title")} />
                <div className="px-5 sm:px-6">
                    <PanelUnavailable reason={propagation.reason} />
                </div>
            </section>
        );
    }

    const report = propagation.data;
    const tone = propagationTone(report);

    function labelFor(node: PropagationNodeResult): string {
        return `${node.name} — ${tStates(node.state)}`;
    }

    const pins: readonly MapPin[] = clusterByCountry(report.nodes).map((cluster) => {
        const { flag, name } = describeCountry(cluster.country);

        return {
            key: cluster.country,
            latitude: cluster.latitude,
            longitude: cluster.longitude,
            tone: cluster.tone,
            title: [flag, name ?? cluster.country].filter(Boolean).join(" "),
            lines: cluster.nodes.map(labelFor),
        };
    });

    return (
        <section className="bg-card ring-border/70 flex min-w-0 flex-col overflow-hidden rounded-2xl ring-1 ring-inset">
            <Header title={t("title")} />

            <div className="flex min-w-0 flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
                {/* The verdict, then what everyone agrees the answer is. */}
                <div className="flex min-w-0 flex-col gap-1.5">
                    <span
                        aria-hidden="true"
                        className={cn("h-0.5 w-6 rounded-full", VERDICT_RULE[tone])}
                    />
                    <p
                        className={cn(
                            "font-mono text-xl leading-[1.3] tabular-nums",
                            VERDICT_TEXT[tone],
                        )}
                    >
                        {t("verdict", { agreed: report.agreed, total: report.total })}
                    </p>
                    <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                        {report.consensus.length === 0
                            ? t("noConsensus", { type: report.type })
                            : t("consensus", {
                                  type: report.type,
                                  values: report.consensus.join(", "),
                              })}
                    </p>
                </div>

                {/*
                 * Map and list side by side once there is room for both, and the
                 * list first in the DOM either way — it is the accessible copy
                 * of everything the pins say, so it should not be something a
                 * screen reader reaches last.
                 */}
                <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                    <NodeList nodes={report.nodes} />

                    <WorldMap
                        pins={pins}
                        label={t("mapLabel")}
                        className="order-first xl:order-0 xl:h-full"
                    />
                </div>

                {/*
                 * Shown only when resolvers actually disagree, and it is not
                 * decoration. A live check of github.com returns five different
                 * addresses across nine resolvers — that is GeoDNS steering
                 * working exactly as intended, and from one vantage point it is
                 * indistinguishable from a change halfway through spreading.
                 * Amber without this sentence reads as "your change is broken".
                 */}
                {tone === "warn" && (
                    <p className="text-muted-foreground border-border/60 border-l-2 pl-3 text-[0.6875rem] leading-normal">
                        {t("divergenceNote")}
                    </p>
                )}

                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("vantageNote")}
                </p>
            </div>
        </section>
    );
}

function NodeList({ nodes }: { nodes: readonly PropagationNodeResult[] }) {
    const t = useTranslations("domainInspector.propagation");
    const tStates = useTranslations("domainInspector.propagationStates");
    const format = useFormatter();
    const describeCountry = useCountryName();

    return (
        <ul
            aria-label={t("listLabel")}
            className="divide-border/50 ring-border/60 min-w-0 divide-y rounded-xl px-3.5 ring-1 ring-inset"
        >
            {nodes.map((node) => {
                const { flag, name } = describeCountry(node.country);

                return (
                    <li key={node.id} className="flex min-w-0 flex-col gap-1 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                            {/*
                             * The flag alone is decoration; the name beside it
                             * is the label. Pairing them means the row still
                             * reads on a system with no flag glyphs, where the
                             * pair renders as the two letters instead.
                             */}
                            {flag !== null && (
                                <span aria-hidden="true" className="shrink-0 text-sm">
                                    {flag}
                                </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-[0.8125rem] leading-[1.4]">
                                {node.name}
                            </span>
                            <Chip tone={STATE_TONES[node.state]}>{tStates(node.state)}</Chip>
                        </div>

                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-muted-foreground shrink-0 text-[0.6875rem] leading-normal">
                                {name ?? node.country}
                                {node.anycast && ` · ${t("anycast")}`}
                            </span>
                            <span className="text-muted-foreground min-w-0 flex-1 font-mono text-[0.6875rem] leading-normal wrap-anywhere">
                                {node.values.join(" ")}
                            </span>
                            {node.ttl !== null && (
                                <span className="text-muted-foreground shrink-0 font-mono text-[0.6875rem] leading-normal tabular-nums">
                                    {t("ttl", { seconds: format.number(node.ttl) })}
                                </span>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function Header({ title }: { title: string }) {
    return (
        <header className="flex min-w-0 items-center gap-2.5 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <span className="shrink-0 text-[color-mix(in_oklch,var(--tool-accent)_70%,var(--muted-foreground))]">
                <IconWorldPin className="size-4" stroke={1.8} aria-hidden="true" />
            </span>
            <h2 className={cn(LABEL, "min-w-0 flex-1")}>{title}</h2>
        </header>
    );
}
