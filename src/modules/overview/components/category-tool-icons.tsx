"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS, TOOL_ICON_TILE } from "@/modules/tools/components/tool-accent";
import { ToolIcon } from "@/modules/tools/components/tool-icon";
import type { LocalizedTool } from "@/modules/tools/types";

/**
 * Only the fields a tile and its preview render.
 *
 * A category card carries up to seven tools and the grid carries eight cards,
 * so passing whole catalog entries across the boundary would serialise every
 * search keyword and ranking hint into the page for a row of icons.
 */
export type CategoryToolIcon = Pick<
    LocalizedTool,
    "id" | "href" | "name" | "description" | "status" | "accent" | "icon"
>;

/** Opens fast enough to feel like a pointer response rather than a timer. */
const OPEN_DELAY_MS = 140;
const CLOSE_DELAY_MS = 120;

type CategoryToolIconsProps = {
    tools: readonly CategoryToolIcon[];
    /** Names the row for a screen reader — "Tools in Security". */
    label: string;
};

/**
 * The tool row on a category card: each tool's own icon in its own accent, with
 * a preview card behind it.
 *
 * The preview is a convenience for a pointer, never the only copy of anything —
 * Base UI's preview card is explicitly a sighted-user affordance, so each tile
 * carries its tool's name for a screen reader and links to the page where the
 * same description is prose.
 */
export function CategoryToolIcons({ tools, label }: CategoryToolIconsProps) {
    const t = useTranslations("common");

    return (
        <ul aria-label={label} className="flex flex-wrap items-center gap-1.5">
            {tools.map((tool) => {
                const available = tool.status === "available";

                const tile = (
                    <>
                        <ToolIcon name={tool.icon} className="size-4" />
                        <span className="sr-only">{tool.name}</span>
                    </>
                );

                const tileClassName = cn(
                    TOOL_ICON_TILE,
                    TOOL_ACCENT_VARS[tool.accent],
                    "size-8 outline-none transition-transform duration-200",
                    available
                        ? "hover:scale-[1.08] focus-visible:ring-2 focus-visible:ring-ring data-popup-open:scale-[1.08]"
                        : "opacity-55",
                );

                return (
                    <li key={tool.id}>
                        <HoverCard>
                            <HoverCardTrigger
                                delay={OPEN_DELAY_MS}
                                closeDelay={CLOSE_DELAY_MS}
                                render={
                                    available ? (
                                        <Link href={tool.href} className={tileClassName}>
                                            {tile}
                                        </Link>
                                    ) : (
                                        <span aria-disabled="true" className={tileClassName}>
                                            {tile}
                                        </span>
                                    )
                                }
                            />
                            <HoverCardContent side="top" className="w-64">
                                <div className="flex items-start gap-2.5">
                                    <span
                                        className={cn(
                                            TOOL_ICON_TILE,
                                            TOOL_ACCENT_VARS[tool.accent],
                                            "size-8",
                                        )}
                                    >
                                        <ToolIcon name={tool.icon} className="size-4" />
                                    </span>
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <p className="text-[0.8125rem] leading-tight font-medium">
                                            {tool.name}
                                        </p>
                                        <p className="text-muted-foreground text-xs leading-relaxed">
                                            {tool.description}
                                        </p>
                                        <p className="text-muted-foreground/80 text-[0.6875rem] font-medium">
                                            {available ? t("openTool") : t("comingSoon")}
                                        </p>
                                    </div>
                                </div>
                            </HoverCardContent>
                        </HoverCard>
                    </li>
                );
            })}
        </ul>
    );
}
