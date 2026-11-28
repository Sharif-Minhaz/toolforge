import { IconTerminal2, IconUserShield, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { ChmodArticle, getChmodFaqEntries } from "@/modules/chmod/components/chmod-article";
import { ChmodWorkbench } from "@/modules/chmod/components/chmod-workbench";
import { ChmodWorkbenchSkeleton } from "@/modules/chmod/components/chmod-workbench-skeleton";
import { DEFAULT_MODE } from "@/modules/chmod/domain/constants";
import { parseMode } from "@/modules/chmod/domain/parse";
import { chmodSearchParamsSchema } from "@/modules/chmod/validation/chmod-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/chmod";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("chmod.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("chmod")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ChmodPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ChmodToolPage({ params, searchParams }: ChmodPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("chmod.hero"),
        getTranslations("tools"),
        getChmodFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeGnu"), Icon: IconTerminal2 },
        { label: t("badgeSpecial"), Icon: IconUserShield },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("chmod.name"),
                    description: tTools("chmod.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("chmod")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="chmod"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ChmodWorkbenchSkeleton />}>
                        <ChmodWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ChmodArticle />
                </Reveal>

                <RelatedTools toolId="chmod" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the mode from `?mode=`, octal or
 * symbolic. One that does not parse opens the default rather than an error.
 * Everything around it is prerendered.
 */
async function ChmodWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = chmodSearchParamsSchema.safeParse(await searchParams);
    const requested = parseMode((parsed.success ? parsed.data.mode : undefined) ?? "");

    return <ChmodWorkbench initialMode={requested.ok ? requested.mode : DEFAULT_MODE} />;
}
