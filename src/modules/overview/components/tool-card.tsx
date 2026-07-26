import { IconArrowUpRight } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS, TOOL_ICON_TILE } from "@/modules/tools/components/tool-accent";
import { ToolIcon } from "@/modules/tools/components/tool-icon";
import type { LocalizedTool } from "@/modules/tools/types";

export function ToolCard({ tool }: { tool: LocalizedTool }) {
    const t = useTranslations("common");
    const available = tool.status === "available";

    const body = (
        <>
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,color-mix(in_oklch,var(--tool-accent)_16%,transparent),transparent_72%)] opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
            />

            <div className="relative flex items-start justify-between gap-3">
                <span className={cn(TOOL_ICON_TILE, "size-9")}>
                    <ToolIcon name={tool.icon} className="size-4.5" />
                </span>

                {available ? (
                    <IconArrowUpRight
                        className="text-muted-foreground group-hover/card:text-foreground size-4 shrink-0 transition-all duration-200 group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                ) : (
                    <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-1 text-[0.625rem] leading-[1.3] font-medium">
                        {t("soon")}
                    </span>
                )}
            </div>

            <div className="relative flex flex-col gap-1.5">
                <h3 className="text-[0.9375rem] font-medium tracking-tight">{tool.name}</h3>
                <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                    {tool.description}
                </p>
            </div>

            <span className="bg-muted/70 text-muted-foreground relative mt-auto w-fit rounded-full px-2 py-0.5 text-[0.6875rem] font-medium">
                {tool.categoryLabel}
            </span>
        </>
    );

    const shell = cn(
        "group/card relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl bg-card p-4",
        "ring-1 ring-border/70 ring-inset transition-all duration-200",
        TOOL_ACCENT_VARS[tool.accent],
        available
            ? "hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-14px_oklch(0_0_0/0.35)] hover:ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            : "opacity-70",
    );

    if (!available) {
        return (
            <li>
                <div aria-disabled="true" className={shell}>
                    {body}
                </div>
            </li>
        );
    }

    return (
        <li>
            <Link href={tool.href} className={shell}>
                {body}
            </Link>
        </li>
    );
}
