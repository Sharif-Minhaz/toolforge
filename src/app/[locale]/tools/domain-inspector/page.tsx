import { IconCertificate, IconShieldLock, IconWorldSearch } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    DomainInspectorArticle,
    getDomainInspectorFaqEntries,
} from "@/modules/domain-inspector/components/domain-inspector-article";
import { DomainInspectorWorkbench } from "@/modules/domain-inspector/components/domain-inspector-workbench";
import { DomainInspectorWorkbenchSkeleton } from "@/modules/domain-inspector/components/domain-inspector-workbench-skeleton";
import { DEFAULT_INSPECTION_OPTIONS } from "@/modules/domain-inspector/domain/constants";
import { inspectionSearchParamsSchema } from "@/modules/domain-inspector/validation/inspection";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/domain-inspector";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("domainInspector.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("domain-inspector")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type DomainInspectorPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function DomainInspectorToolPage({
    params,
    searchParams,
}: DomainInspectorPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("domainInspector.hero"),
        getTranslations("tools"),
        getDomainInspectorFaqEntries(),
        getLocale(),
    ]);

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
                <ToolPageHeader
                    toolId="domain-inspector"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<DomainInspectorWorkbenchSkeleton />}>
                        <DomainInspectorWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <DomainInspectorArticle />
                </Reveal>

                <RelatedTools toolId="domain-inspector" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options to prefill
 * the form. Everything around it is prerendered.
 */
async function DomainInspectorWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = inspectionSearchParamsSchema.safeParse(await searchParams);

    // Only the form is prefilled from the link. The lookup itself still needs a
    // press, because a URL that fires network requests on load is a URL anybody
    // can point at anything.
    const initialHost = (parsed.success ? parsed.data.host : undefined) ?? "";
    const resolver =
        (parsed.success ? parsed.data.resolver : undefined) ?? DEFAULT_INSPECTION_OPTIONS.resolver;

    // Read on the server and handed down, so the island never reaches for
    // `process.env` and an unconfigured deployment says so plainly.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    return (
        <DomainInspectorWorkbench
            initialHost={initialHost}
            initialOptions={{ ...DEFAULT_INSPECTION_OPTIONS, resolver }}
            siteKey={siteKey}
        />
    );
}
