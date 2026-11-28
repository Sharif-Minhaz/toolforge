import { IconChevronRight, type TablerIcon } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn } from "@/components/motion/reveal";
import { toolSourceLinks } from "../domain/tool-source";
import type { ToolId } from "../types";
import { ToolSourceMenu } from "./tool-source-menu";

export type ToolHeaderBadge = {
    readonly label: string;
    readonly Icon: TablerIcon;
};

type ToolPageHeaderProps = {
    toolId: ToolId;
    /** The breadcrumb's last step — the tool's category. */
    eyebrow: string;
    title: string;
    subtitle: string;
    badges: readonly ToolHeaderBadge[];
};

/**
 * The top of every page under `/tools`: breadcrumb with the "Improve" menu
 * beside it, the title, the subtitle, and the badges. Static — it renders in
 * the prerendered shell, so nothing per-request may be passed in.
 */
export async function ToolPageHeader({
    toolId,
    eyebrow,
    title,
    subtitle,
    badges,
}: ToolPageHeaderProps) {
    const tNav = await getTranslations("nav");

    return (
        <FadeIn className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <nav aria-label={tNav("breadcrumb")} className="min-w-0">
                    <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                        <li>
                            <Link
                                href="/"
                                className="hover:text-foreground focus-visible:ring-ring rounded transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                            >
                                {tNav("overview")}
                            </Link>
                        </li>
                        <li aria-hidden="true">
                            <IconChevronRight className="size-3.5" stroke={2} />
                        </li>
                        <li className="text-foreground">{eyebrow}</li>
                    </ol>
                </nav>
                <ToolSourceMenu links={toolSourceLinks(toolId)} />
            </div>

            <div className="flex flex-col gap-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
                <p className="text-muted-foreground text-[0.9375rem] leading-7 sm:text-base">
                    {subtitle}
                </p>
            </div>

            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {badges.map(({ label, Icon }) => (
                    <li
                        key={label}
                        className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
                    >
                        <Icon className="size-3.5" stroke={1.9} aria-hidden="true" />
                        {label}
                    </li>
                ))}
            </ul>
        </FadeIn>
    );
}
