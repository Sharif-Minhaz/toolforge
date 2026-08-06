"use client";

import { IconArrowRight, IconDatabase, IconPlayerPause } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";

import type { JsonServerSummary } from "../types";
import { UsageBar } from "./usage-bar";

type ServerCardProps = {
    server: JsonServerSummary;
};

/**
 * One server in the list on `/json`.
 *
 * A `<Link>` styled as a button rather than `<Button render={<Link/>}>` — Base
 * UI's `Button` expects a real `<button>`, and navigation is an anchor.
 *
 * Every count goes through the formatter so Bangla renders Bengali numerals:
 * these read as prose ("3 collections, 42 records"), not as machine input.
 */
export function ServerCard({ server }: ServerCardProps) {
    const t = useTranslations("jsonServer.card");
    const format = useFormatter();

    return (
        <li
            className={cn(
                "border-border/70 bg-card flex min-w-0 flex-col gap-3 rounded-2xl border p-4 shadow-xs",
                TOOL_ACCENT_VARS.amber,
            )}
        >
            <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--tool-accent)]/10 text-[var(--tool-accent)]">
                    <IconDatabase className="size-4.5" stroke={1.75} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                    <h3 className="text-foreground truncate text-sm leading-[1.3] font-semibold">
                        {server.name}
                    </h3>
                    <p className="text-muted-foreground mt-0.5 truncate font-mono text-[0.6875rem] leading-[1.3]">
                        /j/{server.key}
                    </p>
                </div>

                {server.isPaused ? (
                    <span className="text-brand-amber border-brand-amber/40 bg-brand-amber/8 flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-1 text-[0.625rem] leading-[1.3] font-medium">
                        <IconPlayerPause className="size-3" stroke={2} aria-hidden="true" />
                        {t("paused")}
                    </span>
                ) : null}
            </div>

            <p className="text-muted-foreground text-xs leading-relaxed">
                {t("counts", {
                    resources: format.number(server.resourceCount),
                    records: format.number(server.recordCount),
                })}
            </p>

            <UsageBar usage={server.usage} />

            <Link
                href={`/json/${server.id}`}
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5")}
            >
                {t("open")}
                <IconArrowRight className="size-3.5" stroke={1.9} aria-hidden="true" />
            </Link>
        </li>
    );
}
