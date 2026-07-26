import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS, TOOL_ICON_TILE } from "@/modules/tools/components/tool-accent";
import { ToolIcon } from "@/modules/tools/components/tool-icon";
import { getRecentTools } from "@/modules/tools/domain/tool-catalog";
import { localizeTools } from "@/modules/tools/presenters/localize-tools";
import type { LocalizedTool } from "@/modules/tools/types";
import { SectionHeading } from "./section-heading";

export async function RecentTools() {
    const [t, tCommon, formatter, tools] = await Promise.all([
        getTranslations("overview.recent"),
        getTranslations("common"),
        getFormatter(),
        localizeTools(getRecentTools(5)),
    ]);

    function renderRow(tool: LocalizedTool) {
        const available = tool.status === "available";

        const inner = (
            <>
                <span className={cn(TOOL_ICON_TILE, "size-8")}>
                    <ToolIcon name={tool.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium">
                    {tool.name}
                </span>
                <span
                    className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[0.625rem] leading-[1.3] font-medium",
                        available
                            ? "bg-[color-mix(in_oklch,var(--color-success)_16%,transparent)] text-[var(--color-success)]"
                            : "bg-muted text-muted-foreground",
                    )}
                >
                    {available ? tCommon("live") : tCommon("soon")}
                </span>
                <time
                    dateTime={tool.addedOn}
                    className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block"
                >
                    {formatter.dateTime(new Date(tool.addedOn), {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                    })}
                </time>
            </>
        );

        const rowClass = cn(
            "flex items-center gap-3 px-3 py-2.5 transition-colors duration-200",
            TOOL_ACCENT_VARS[tool.accent],
            available
                ? "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:-outline-offset-2"
                : "opacity-65",
        );

        return available ? (
            <Link href={tool.href} className={rowClass}>
                {inner}
            </Link>
        ) : (
            <div aria-disabled="true" className={rowClass}>
                {inner}
            </div>
        );
    }

    return (
        <section className="flex flex-col gap-4">
            <SectionHeading title={t("title")} description={t("description")} />

            <Reveal>
                <ul className="divide-border/60 bg-card ring-border/70 divide-y overflow-hidden rounded-2xl ring-1 ring-inset">
                    {tools.map((tool) => (
                        <li key={tool.id}>{renderRow(tool)}</li>
                    ))}
                </ul>
            </Reveal>
        </section>
    );
}
