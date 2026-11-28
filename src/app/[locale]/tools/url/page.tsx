import { IconFileTypeTxt, IconShieldCheck, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isEncodable } from "@/modules/tools/domain/charsets";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { UrlArticle, getUrlFaqEntries } from "@/modules/url/components/url-article";
import { UrlWorkbench } from "@/modules/url/components/url-workbench";
import { UrlWorkbenchSkeleton } from "@/modules/url/components/url-workbench-skeleton";
import {
    DEFAULT_URL_CHARSET,
    DEFAULT_URL_MODE,
    DEFAULT_URL_PROFILE,
} from "@/modules/url/domain/constants";
import { urlSearchParamsSchema } from "@/modules/url/validation/conversion-options";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/url";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("url.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("url")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type UrlPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function UrlToolPage({ params, searchParams }: UrlPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("url.hero"),
        getTranslations("tools"),
        getUrlFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeRfc"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeFiles"), Icon: IconFileTypeTxt },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("url.name"),
                    description: tTools("url.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("url")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="url"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<UrlWorkbenchSkeleton />}>
                        <UrlWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <UrlArticle />
                </Reveal>

                <RelatedTools toolId="url" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the mode, text, profile and charset
 * from the URL. Everything around it is prerendered.
 */
async function UrlWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = urlSearchParamsSchema.safeParse(await searchParams);
    const mode = (parsed.success ? parsed.data.mode : undefined) ?? DEFAULT_URL_MODE;
    const text = (parsed.success ? parsed.data.text : undefined) ?? "";
    const profile = (parsed.success ? parsed.data.profile : undefined) ?? DEFAULT_URL_PROFILE;
    const requestedCharset =
        (parsed.success ? parsed.data.charset : undefined) ?? DEFAULT_URL_CHARSET;
    // A link may name a set that can only be read; encoding falls back to UTF-8
    // rather than opening on an error.
    const charset =
        mode === "encode" && !isEncodable(requestedCharset)
            ? DEFAULT_URL_CHARSET
            : requestedCharset;

    return (
        <UrlWorkbench
            initialMode={mode}
            initialText={text}
            initialProfile={profile}
            initialCharset={charset}
        />
    );
}
