import { IconTerminal2, IconWorldOff, IconAlertTriangle } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { CurlArticle, getCurlFaqEntries } from "@/modules/curl/components/curl-article";
import { CurlWorkbench } from "@/modules/curl/components/curl-workbench";
import { CurlWorkbenchSkeleton } from "@/modules/curl/components/curl-workbench-skeleton";
import {
    DEFAULT_CODE_OPTIONS,
    DEFAULT_CURL_OPTIONS,
    DEFAULT_DIRECTION,
    SAMPLE_CURL,
    SAMPLE_FETCH,
} from "@/modules/curl/domain/constants";
import { runtimeApplies, styleApplies } from "@/modules/curl/domain/targets";
import { curlSearchParamsSchema } from "@/modules/curl/validation/curl-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/curl";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("curl.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("curl")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type CurlPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function CurlToolPage({ params, searchParams }: CurlPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("curl.hero"),
        getTranslations("tools"),
        getCurlFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeShells"), Icon: IconTerminal2 },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeHonest"), Icon: IconAlertTriangle },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("curl.name"),
                    description: tTools("curl.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("curl")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="curl"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<CurlWorkbenchSkeleton />}>
                        <CurlWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <CurlArticle />
                </Reveal>

                <RelatedTools toolId="curl" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options, so a shared
 * link opens on the request it carries. Everything around it is prerendered.
 */
async function CurlWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = curlSearchParamsSchema.safeParse(await searchParams);
    const read = parsed.success ? parsed.data : {};
    const direction = read.direction ?? DEFAULT_DIRECTION;
    const target = read.target ?? DEFAULT_CODE_OPTIONS.target;

    // A link may name an option the chosen target ignores. Opening on the
    // default is friendlier than opening on a control that is disabled and
    // disagrees with the output beside it.
    const runtime = runtimeApplies(target)
        ? (read.runtime ?? DEFAULT_CODE_OPTIONS.runtime)
        : DEFAULT_CODE_OPTIONS.runtime;
    const style = styleApplies(target)
        ? (read.style ?? DEFAULT_CODE_OPTIONS.style)
        : DEFAULT_CODE_OPTIONS.style;

    // Generated on the server and passed down, so the first paint already holds
    // a converted request rather than an empty box.
    const input = read.input ?? (direction === "curlToCode" ? SAMPLE_CURL : SAMPLE_FETCH);

    return (
        <CurlWorkbench
            initialDirection={direction}
            initialInput={input}
            initialTarget={target}
            initialRuntime={runtime}
            initialStyle={style}
            initialShell={read.shell ?? DEFAULT_CURL_OPTIONS.shell}
        />
    );
}
