import { IconBolt, IconBrandGithub, IconLayoutGrid } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { FadeIn } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { InstallAppButton } from "@/modules/pwa/components/install-app-button";
import { SITE_REPOSITORY } from "@/modules/seo/domain/site";
import { generateUuid } from "@/modules/uuid/domain/generate";

/**
 * Below `sm` the two secondary actions drop their labels so all three sit on
 * one row. The label stays for screen readers; and when the install button
 * renders nothing (server render, installed, unsupported) "Browse" is first
 * in the row and keeps its visible label.
 */
const CTA = "h-10 px-4 text-[0.9375rem]";
const ICON_ONLY_ON_PHONE = "max-sm:w-10 max-sm:px-0";

export async function OverviewHero() {
    const [t, tNav] = await Promise.all([getTranslations("overview.hero"), getTranslations("nav")]);

    return (
        <section className="bg-card/60 ring-border/70 relative isolate overflow-hidden rounded-3xl ring-1 ring-inset">
            {/* From `md` only: animated blurred blobs, backdrop blur and the
                gradient headline repaint on every scroll frame on a phone. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 hidden md:block"
            >
                <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(120%_100%_at_50%_0%,#000,transparent_72%)] [--grid-size:3rem]" />
                <div className="animate-aurora absolute -top-32 -left-16 size-96 rounded-full bg-[radial-gradient(circle,var(--brand-violet),transparent_65%)] opacity-18 blur-3xl" />
                <div className="animate-drift absolute -right-16 -bottom-32 size-96 rounded-full bg-[radial-gradient(circle,var(--brand-cyan),transparent_65%)] opacity-16 blur-3xl" />
            </div>

            <div className="grid gap-10 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-12 lg:py-16">
                <FadeIn className="flex min-w-0 flex-col items-start gap-6">
                    <span className="bg-background/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset md:backdrop-blur">
                        <IconBolt className="text-primary size-3.5" stroke={2} aria-hidden="true" />
                        {t("badge")}
                    </span>

                    <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-[3.25rem]">
                        {t("titleLead")}{" "}
                        <span className="md:text-gradient">{t("titleAccent")}</span>
                    </h1>

                    <p className="text-muted-foreground max-w-xl text-[0.9375rem] leading-7 sm:text-base">
                        {t("subtitle")}
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <InstallAppButton className={CTA} />
                        <Link
                            href="#featured-tools"
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                CTA,
                                ICON_ONLY_ON_PHONE,
                                "max-sm:first:w-auto max-sm:first:px-4",
                            )}
                        >
                            <IconLayoutGrid className="size-4" stroke={1.9} aria-hidden="true" />
                            <span className="max-sm:sr-only max-sm:[a:first-child>&]:not-sr-only">
                                {t("secondaryCta")}
                            </span>
                        </Link>
                        <a
                            href={SITE_REPOSITORY}
                            target="_blank"
                            rel="noreferrer noopener"
                            // The visible label is trimmed to fit beside the two
                            // primary CTAs; the full destination lives here.
                            aria-label={tNav("repository")}
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                CTA,
                                ICON_ONLY_ON_PHONE,
                            )}
                        >
                            <IconBrandGithub className="size-4" stroke={1.9} aria-hidden="true" />
                            <span className="max-sm:sr-only">{t("repoCta")}</span>
                        </a>
                    </div>
                </FadeIn>

                <FadeIn delay={0.1} className="w-full min-w-0">
                    <div className="bg-background/70 ring-border/80 md:panel-sheen rounded-2xl p-4 ring-1 ring-inset md:backdrop-blur-xl">
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
                            {/* Same-width placeholder, so the box does not resize. */}
                            <Suspense
                                fallback={
                                    <span className="invisible">{SAMPLE_UUID_PLACEHOLDER}</span>
                                }
                            >
                                <SampleUuid />
                            </Suspense>
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

const SAMPLE_UUID_PLACEHOLDER = "00000000-0000-4000-8000-000000000000";

/**
 * Real output rather than a mockup, minted per request. The hero is otherwise
 * prerendered, and a UUID baked into that HTML would be the same for every
 * visitor — so it waits on `connection()` behind its own `<Suspense>`.
 */
async function SampleUuid() {
    await connection();

    return generateUuid(4);
}
