import {
    IconAdjustmentsHorizontal,
    IconAi,
    IconArrowsLeftRight,
    IconCalculator,
    IconCube,
    IconDeviceDesktop,
    IconPhoto,
    IconShieldLock,
    IconTypography,
    IconWorld,
    type Icon,
} from "@tabler/icons-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { KEYCAP_ICON } from "@/modules/tools/components/tool-accent";
import { needsNetwork } from "@/modules/tools/domain/network";
import { localizeCategoryGroups } from "@/modules/tools/presenters/localize-tools";
import type { ToolCategory } from "@/modules/tools/types";
import { CategoryToolIcons } from "./category-tool-icons";
import { SectionHeading } from "./section-heading";

const CATEGORY_ICON: Record<ToolCategory, Icon> = {
    generators: IconCube,
    encoding: IconArrowsLeftRight,
    formatting: IconAdjustmentsHorizontal,
    security: IconShieldLock,
    network: IconWorld,
    text: IconTypography,
    media: IconPhoto,
    ai: IconAi,
    hardware: IconDeviceDesktop,
    calculators: IconCalculator,
};

export async function CategoryGrid() {
    const [t, tCommon, formatter, groups] = await Promise.all([
        getTranslations("overview.categoriesSection"),
        getTranslations("common"),
        getFormatter(),
        localizeCategoryGroups(),
    ]);

    return (
        <section className="flex flex-col gap-4">
            <SectionHeading title={t("title")} description={t("description")} />

            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map((group, index) => {
                    const CategoryIcon = CATEGORY_ICON[group.category];

                    return (
                        <li
                            key={group.category}
                            // A category made only of server tools leaves the grid offline.
                            data-needs-network={group.tools.every(needsNetwork) || undefined}
                            className="h-full"
                        >
                            <Reveal
                                delay={staggerDelay(index)}
                                className="bg-card ring-border/70 flex h-full flex-col gap-4 rounded-2xl p-5 ring-1 ring-inset"
                            >
                                <div className="flex items-start gap-4">
                                    <span className={cn(KEYCAP_ICON, "size-10")}>
                                        <CategoryIcon
                                            className="size-5"
                                            stroke={1.75}
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                                        <h3 className="text-base font-semibold tracking-tight">
                                            {group.label}
                                        </h3>
                                        <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">
                                            {group.description}
                                        </p>
                                    </div>
                                    <span className="text-muted-foreground shrink-0 pt-0.5 font-mono text-xs tabular-nums">
                                        <span aria-hidden="true">
                                            {formatter.number(group.availableCount)}
                                        </span>
                                        <span className="sr-only">
                                            {tCommon("toolCount", { count: group.availableCount })}
                                        </span>
                                    </span>
                                </div>

                                <div className="border-foreground/15 mt-auto flex flex-col gap-2 border-t border-dashed pt-3">
                                    {/* Narrowed here rather than in the island: the whole
                                    catalog entry would ship its keywords and ranking
                                    hints to the browser for a row of icons. */}
                                    <CategoryToolIcons
                                        label={t("toolsLabel", { category: group.label })}
                                        tools={group.tools.map((tool) => ({
                                            id: tool.id,
                                            href: tool.href,
                                            name: tool.name,
                                            description: tool.description,
                                            status: tool.status,
                                            accent: tool.accent,
                                            icon: tool.icon,
                                            runsOn: tool.runsOn,
                                        }))}
                                    />
                                    {group.availableCount === 0 && (
                                        <p className="text-muted-foreground text-xs">
                                            {tCommon("comingSoon")}
                                        </p>
                                    )}
                                </div>
                            </Reveal>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
