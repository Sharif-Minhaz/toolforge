import {
    IconChevronRight,
    IconCertificate,
    IconShieldLock,
    IconWorldSearch,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    DomainInspectorArticle,
    getDomainInspectorFaqEntries,
} from "@/modules/domain-inspector/components/domain-inspector-article";
import { DomainInspectorWorkbench } from "@/modules/domain-inspector/components/domain-inspector-workbench";
import { DEFAULT_INSPECTION_OPTIONS } from "@/modules/domain-inspector/domain/constants";
import { inspectionSearchParamsSchema } from "@/modules/domain-inspector/validation/inspection";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/domain-inspector";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("domainInspector.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("domain-inspector")?.keywords,
    });
}

type DomainInspectorPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DomainInspectorToolPage({ searchParams }: DomainInspectorPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("domainInspector.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getDomainInspectorFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = inspectionSearchParamsSchema.safeParse(params);

    // Only the form is prefilled from the link. The lookup itself still needs a
    // press, because a URL that fires network requests on load is a URL anybody
    // can point at anything.
    const initialHost = (parsed.success ? parsed.data.host : undefined) ?? "";
    const resolver =
        (parsed.success ? parsed.data.resolver : undefined) ?? DEFAULT_INSPECTION_OPTIONS.resolver;

    // Read on the server and handed down, so the island never reaches for
    // `process.env` and an unconfigured deployment says so plainly.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    const badges = [
        { label: t("badgeDns"), Icon: IconWorldSearch },
        { label: t("badgeRegistry"), Icon: IconCertificate },
        { label: t("badgeChallenge"), Icon: IconShieldLock },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("domain-inspector.name"),
                    description: tTools("domain-inspector.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("domain-inspector")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <FadeIn className="flex flex-col gap-4">
                    <nav aria-label={tNav("breadcrumb")}>
                        <ol className="text-muted-foreground flex items-center gap-1 text-xs">
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
                            <li className="text-foreground">{t("eyebrow")}</li>
                        </ol>
                    </nav>

                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            {t("title")}
                        </h1>
                        <p className="text-muted-foreground max-w-2xl text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
                            >
                                <Icon
                                    className="text-primary size-3.5"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

                <FadeIn delay={0.06}>
                    <DomainInspectorWorkbench
                        initialHost={initialHost}
                        initialOptions={{ ...DEFAULT_INSPECTION_OPTIONS, resolver }}
                        siteKey={siteKey}
                    />
                </FadeIn>

                <Reveal>
                    <DomainInspectorArticle />
                </Reveal>

                <RelatedTools toolId="domain-inspector" />
            </div>
        </>
    );
}
