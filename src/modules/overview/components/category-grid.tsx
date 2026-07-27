import { getFormatter, getTranslations } from "next-intl/server";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { localizeCategoryGroups } from "@/modules/tools/presenters/localize-tools";
import { SectionHeading } from "./section-heading";

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

            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map((group, index) => (
                    <Reveal
                        key={group.category}
                        as="li"
                        delay={staggerDelay(index)}
                        className="bg-card ring-border/70 flex h-full flex-col gap-2 rounded-2xl p-4 ring-1 ring-inset"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[0.9375rem] font-medium tracking-tight">
                                {group.label}
                            </h3>
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-mono text-[0.6875rem] tabular-nums">
                                {formatter.number(group.tools.length)}
                            </span>
                        </div>
                        <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                            {group.description}
                        </p>
                        <p className="text-muted-foreground/80 mt-auto pt-1 text-xs">
                            {group.availableCount > 0
                                ? tCommon("toolCount", { count: group.availableCount })
                                : tCommon("comingSoon")}
                        </p>
                    </Reveal>
                ))}
            </ul>
        </section>
    );
}
