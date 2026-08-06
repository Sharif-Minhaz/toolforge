"use client";

import { IconChevronRight, IconPlayerPause } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { DocumentUsageBar } from "@/modules/tools/components/document-usage-bar";

import type { GraphqlServerSummary } from "../types";

type ServerCardProps = {
    server: GraphqlServerSummary;
};

/**
 * One server in the list.
 *
 * The whole card is the link rather than a button inside it, so the hit target
 * on a phone is the card and not a twelve-pixel chevron. The usage bar is here
 * in its short form — a row is a summary, and the sentence explaining what
 * happens at the ceiling belongs on the page that can act on it.
 */
export function ServerCard({ server }: ServerCardProps) {
    const t = useTranslations("graphqlServer.card");

    return (
        <Link
            href={`/graphql/${server.id}`}
            className={cn(
                "border-border/70 bg-card focus-visible:ring-ring group flex min-w-0 flex-col gap-3 rounded-2xl border p-4 transition-colors duration-200",
                "hover:border-border hover:bg-card/80 focus-visible:ring-2 focus-visible:outline-none",
            )}
        >
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    {/*
                        `min-w-0` and `truncate` together, or a sixty-character
                        name blows the card out of the grid at 390px.
                    */}
                    <p className="text-foreground truncate text-sm leading-[1.3] font-medium">
                        {server.name}
                    </p>
                    <p className="text-muted-foreground truncate font-mono text-xs">
                        /g/{server.key}
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {server.isPaused ? (
                        <span className="border-border/70 bg-muted/40 text-muted-foreground inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[0.6875rem] leading-[1.3]">
                            <IconPlayerPause
                                className="size-3 shrink-0"
                                stroke={2}
                                aria-hidden="true"
                            />
                            {t("paused")}
                        </span>
                    ) : null}
                    <IconChevronRight
                        className="text-muted-foreground group-hover:text-foreground size-4 transition-colors"
                        stroke={2}
                        aria-hidden="true"
                    />
                </div>
            </div>

            <p className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                {t("counts", { types: server.typeCount, records: server.recordCount })}
            </p>

            <DocumentUsageBar usage={server.usage} />
        </Link>
    );
}
