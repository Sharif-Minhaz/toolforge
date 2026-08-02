import { IconArrowRight } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { getRelatedTools } from "../domain/tool-catalog";
import { localizeTools } from "../presenters/localize-tools";
import type { ToolId } from "../types";
import { ToolCard } from "./tool-card";

type RelatedToolsProps = {
    /** The tool whose page this sits on; it is never suggested to itself. */
    toolId: ToolId;
    limit?: number;
};

/**
 * Foot-of-page suggestions, shared by every tool page.
 *
 * Renders nothing at all rather than an empty heading, so the section cannot
 * survive as a stub if the catalog ever shrinks to a single shipped tool.
 */
export async function RelatedTools({ toolId, limit = 3 }: RelatedToolsProps) {
    const [t, tools] = await Promise.all([
        getTranslations("tools.related"),
        localizeTools(getRelatedTools(toolId, limit)),
    ]);

    if (tools.length === 0) {
        return null;
    }

    return (
        <section
            aria-labelledby="related-tools-title"
            className="border-border/70 flex flex-col gap-4 border-t pt-8"
        >
            <Reveal className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h2
                        id="related-tools-title"
                        className="text-lg font-semibold tracking-tight sm:text-xl"
                    >
                        {t("title")}
                    </h2>
                    <p className="text-muted-foreground text-sm">{t("description")}</p>
                </div>

                <Link
                    href="/"
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                >
                    {t("all")}
                    <IconArrowRight className="size-4" stroke={1.9} aria-hidden="true" />
                </Link>
            </Reveal>

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
