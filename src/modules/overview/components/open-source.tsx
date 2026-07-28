import {
    IconArrowUpRight,
    IconBrandGithub,
    IconBug,
    IconGitPullRequest,
    IconHeartHandshake,
    IconStar,
} from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SITE_REPOSITORY } from "@/modules/seo/domain/site";

const CONTRIBUTING_URL = `${SITE_REPOSITORY}/blob/main/CONTRIBUTING.md`;

export async function OpenSource() {
    const t = await getTranslations("overview.openSource");

    const ways = [
        {
            key: "star",
            href: SITE_REPOSITORY,
            title: t("ways.star.title"),
            description: t("ways.star.description"),
            Icon: IconStar,
            accent: "[--tool-accent:var(--brand-amber)]",
        },
        {
            key: "issue",
            href: `${SITE_REPOSITORY}/issues/new`,
            title: t("ways.issue.title"),
            description: t("ways.issue.description"),
            Icon: IconBug,
            accent: "[--tool-accent:var(--brand-rose)]",
        },
        {
            key: "pullRequest",
            href: `${SITE_REPOSITORY}/fork`,
            title: t("ways.pullRequest.title"),
            description: t("ways.pullRequest.description"),
            Icon: IconGitPullRequest,
            accent: "[--tool-accent:var(--brand-emerald)]",
        },
    ];

    return (
        <section
            id="open-source"
            aria-labelledby="open-source-title"
            className="bg-card/60 ring-border/70 relative isolate overflow-hidden rounded-3xl ring-1 ring-inset"
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
                <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(120%_100%_at_50%_0%,#000,transparent_72%)] [--grid-size:3rem]" />
                <div className="absolute -top-28 right-0 size-96 rounded-full bg-[radial-gradient(circle,var(--brand-violet),transparent_65%)] opacity-14 blur-3xl" />
            </div>

            <div className="flex flex-col gap-8 px-6 py-10 sm:px-10 sm:py-12">
                <Reveal className="flex min-w-0 flex-col items-start gap-4">
                    <span className="bg-background/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 backdrop-blur ring-inset">
                        <IconBrandGithub
                            className="text-primary size-3.5"
                            stroke={2}
                            aria-hidden="true"
                        />
                        {t("badge")}
                    </span>

                    <h2
                        id="open-source-title"
                        className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl"
                    >
                        {t("title")}
                    </h2>

                    <p className="text-muted-foreground max-w-[68ch] text-[0.9375rem] leading-7">
                        {t("description")}
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <a
                            href={SITE_REPOSITORY}
                            target="_blank"
                            rel="noreferrer noopener"
                            className={cn(buttonVariants(), "h-10 px-4 text-[0.9375rem]")}
                        >
                            <IconBrandGithub className="size-4" stroke={1.9} aria-hidden="true" />
                            {t("primaryCta")}
                        </a>
                        <a
                            href={CONTRIBUTING_URL}
                            target="_blank"
                            rel="noreferrer noopener"
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                "h-10 px-4 text-[0.9375rem]",
                            )}
                        >
                            {t("secondaryCta")}
                            <IconArrowUpRight className="size-4" stroke={1.9} aria-hidden="true" />
                        </a>
                    </div>
                </Reveal>

                <ul className="grid gap-3 sm:grid-cols-3">
                    {ways.map((way, index) => (
                        <Reveal
                            key={way.key}
                            as="li"
                            delay={staggerDelay(index)}
                            className="h-full"
                        >
                            <a
                                href={way.href}
                                target="_blank"
                                rel="noreferrer noopener"
                                className={cn(
                                    "group/way bg-background/70 ring-border/70 hover:ring-border focus-visible:ring-ring relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl p-4 ring-1 transition-all duration-200 ring-inset hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-14px_oklch(0_0_0/0.35)] focus-visible:ring-2 focus-visible:outline-none",
                                    way.accent,
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_oklch,var(--tool-accent)_16%,transparent),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover/way:opacity-100"
                                />
                                <span className="relative flex items-center gap-2.5">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-[0.6rem] bg-[color-mix(in_oklch,var(--tool-accent)_13%,transparent)] text-[--tool-accent] ring-1 ring-[color-mix(in_oklch,var(--tool-accent)_20%,transparent)] ring-inset">
                                        <way.Icon
                                            className="size-4.5"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1 text-[0.9375rem] font-medium tracking-tight">
                                        {way.title}
                                    </span>
                                    <IconArrowUpRight
                                        className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-hover/way:translate-x-0.5 group-hover/way:-translate-y-0.5"
                                        stroke={1.9}
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="text-muted-foreground relative text-[0.8125rem] leading-relaxed">
                                    {way.description}
                                </span>
                            </a>
                        </Reveal>
                    ))}
                </ul>

                <Reveal className="border-border/70 flex items-start gap-3 rounded-2xl border border-dashed px-4 py-3.5">
                    <IconHeartHandshake
                        className="text-primary mt-0.5 size-4.5 shrink-0"
                        stroke={1.8}
                        aria-hidden="true"
                    />
                    <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                        {t("supportNote")}
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
