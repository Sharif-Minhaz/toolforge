import { getTranslations } from "next-intl/server";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { getFeaturedTools } from "@/modules/tools/domain/tool-catalog";
import { localizeTools } from "@/modules/tools/presenters/localize-tools";
import { SectionHeading } from "./section-heading";
import { ToolCard } from "./tool-card";

export async function FeaturedTools() {
    const [t, tools] = await Promise.all([
        getTranslations("overview.featured"),
        localizeTools(getFeaturedTools(6)),
    ]);

    return (
        <section id="featured-tools" className="flex scroll-mt-24 flex-col gap-4">
            <SectionHeading title={t("title")} description={t("description")} />

            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tools.map((tool, index) => (
                    <Reveal key={tool.id} as="li" delay={staggerDelay(index)} className="h-full">
                        <ToolCard tool={tool} />
                    </Reveal>
                ))}
            </ul>
        </section>
    );
}
