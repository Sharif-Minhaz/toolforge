import { getTranslations } from "next-intl/server";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { ToolCard } from "@/modules/tools/components/tool-card";
import { needsNetwork } from "@/modules/tools/domain/network";
import { getFeaturedTools } from "@/modules/tools/domain/tool-catalog";
import { localizeTools } from "@/modules/tools/presenters/localize-tools";
import { SectionHeading } from "./section-heading";

export async function FeaturedTools() {
    const [t, tools] = await Promise.all([
        getTranslations("overview.featured"),
        localizeTools(getFeaturedTools(6)),
    ]);

    return (
        <section id="featured-tools" className="flex scroll-mt-24 flex-col gap-4">
            <SectionHeading
                lead
                title={t.rich("title", {
                    accent: (chunks) => <span className="text-primary">{chunks}</span>,
                })}
                description={t("description")}
            />

            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {tools.map((tool, index) => (
                    <li
                        key={tool.id}
                        data-needs-network={needsNetwork(tool) || undefined}
                        className="h-full"
                    >
                        <Reveal delay={staggerDelay(index)} className="h-full">
                            <ToolCard tool={tool} />
                        </Reveal>
                    </li>
                ))}
            </ul>
        </section>
    );
}
