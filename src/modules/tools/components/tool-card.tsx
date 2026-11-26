import { IconArrowUpRight } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LocalizedTool } from "../types";
import { KEYCAP_ICON } from "./tool-accent";
import { ToolIcon } from "./tool-icon";

/** Card body only. The caller owns the list item — see `FeaturedTools`. */
export function ToolCard({ tool }: { tool: LocalizedTool }) {
    const t = useTranslations("common");
    const available = tool.status === "available";

    const body = (
        <>
            <div className="flex items-start justify-between gap-3">
                <span className={cn(KEYCAP_ICON, "group-hover/card:text-primary size-10")}>
                    <ToolIcon name={tool.icon} className="size-5" />
                </span>

                {available ? (
                    <IconArrowUpRight
                        className="text-muted-foreground group-hover/card:text-primary size-4.5 shrink-0 transition duration-200 group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                ) : (
                    <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-1 text-[0.625rem] leading-[1.3] font-medium">
                        {t("soon")}
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-semibold tracking-tight sm:text-lg">{tool.name}</h3>
                <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">
                    {tool.description}
                </p>
            </div>

            <span className="text-muted-foreground mt-auto text-xs font-medium">
                {tool.categoryLabel}
            </span>
        </>
    );

    const shell = cn(
        "group/card flex h-full flex-col gap-3 rounded-2xl bg-card p-5",
        "ring-1 ring-border/70 ring-inset transition-colors duration-150",
        available
            ? "hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            : "opacity-70",
    );

    if (!available) {
        return (
            <div aria-disabled="true" className={shell}>
                {body}
            </div>
        );
    }

    return (
        <Link href={tool.href} className={shell}>
            {body}
        </Link>
    );
}
