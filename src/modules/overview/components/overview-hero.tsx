import { IconArrowRight, IconBolt, IconLayoutGrid } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { FadeIn } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { generateUuid } from "@/modules/uuid/domain/generate";

export async function OverviewHero() {
    const t = await getTranslations("overview.hero");

    // Rendered server-side, so the sample is real output rather than a mockup —
    // and there is nothing for hydration to reconcile.
    const sampleUuid = generateUuid(4);

    return (
        <section className="bg-card/60 ring-border/70 relative isolate overflow-hidden rounded-3xl ring-1 ring-inset">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
                <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(120%_100%_at_50%_0%,#000,transparent_72%)] [--grid-size:3rem]" />
                <div className="animate-aurora absolute -top-32 -left-16 size-96 rounded-full bg-[radial-gradient(circle,var(--brand-violet),transparent_65%)] opacity-18 blur-3xl" />
                <div className="animate-drift absolute -right-16 -bottom-32 size-96 rounded-full bg-[radial-gradient(circle,var(--brand-cyan),transparent_65%)] opacity-16 blur-3xl" />
            </div>

            <div className="grid gap-10 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-12 lg:py-16">
                <FadeIn className="flex min-w-0 flex-col items-start gap-6">
                    <span className="bg-background/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 backdrop-blur ring-inset">
                        <IconBolt className="text-primary size-3.5" stroke={2} aria-hidden="true" />
                        {t("badge")}
                    </span>

                    <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-[3.25rem]">
                        {t("titleLead")} <span className="text-gradient">{t("titleAccent")}</span>
                    </h1>

                    <p className="text-muted-foreground max-w-xl text-[0.9375rem] leading-7 sm:text-base">
                        {t("subtitle")}
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <Link
                            href="/tools/uuid"
                            className={cn(buttonVariants(), "h-10 px-4 text-[0.9375rem]")}
                        >
                            {t("primaryCta")}
                            <IconArrowRight className="size-4" stroke={2} aria-hidden="true" />
                        </Link>
                        <Link
                            href="#featured-tools"
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                "h-10 px-4 text-[0.9375rem]",
                            )}
                        >
                            <IconLayoutGrid className="size-4" stroke={1.9} aria-hidden="true" />
                            {t("secondaryCta")}
                        </Link>
                    </div>
                </FadeIn>

                <FadeIn delay={0.1} className="w-full min-w-0">
                    <div className="panel-sheen bg-background/70 ring-border/80 rounded-2xl p-4 ring-1 backdrop-blur-xl ring-inset">
                        <div className="flex items-center gap-2 pb-3">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-success)] opacity-60" />
                                <span className="relative inline-flex size-2 rounded-full bg-[var(--color-success)]" />
                            </span>
                            <span className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                                {t("previewLabel")}
                            </span>
                        </div>

                        <code className="bg-muted/60 ring-border/60 block rounded-xl px-3 py-3 font-mono text-[0.8125rem] leading-relaxed ring-1 select-all ring-inset">
                            {sampleUuid}
                        </code>

                        <p className="text-muted-foreground pt-3 text-[0.6875rem]">
                            {t("previewCaption")}
                        </p>
                    </div>
                </FadeIn>
            </div>
        </section>
    );
}
