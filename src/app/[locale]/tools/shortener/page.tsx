import { IconClockPause, IconLock, IconRefresh } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { SITE_URL } from "@/modules/seo/domain/site";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { LinkStateNotice } from "@/modules/short-links/components/link-state-notice";
import { linkBases } from "@/modules/short-links/domain/target";
import { isShortLinkStorageConfigured } from "@/modules/short-links/repository/config";
import {
    getShortenerFaqEntries,
    ShortenerArticle,
} from "@/modules/shortener/components/shortener-article";
import { ShortenerWorkbench } from "@/modules/shortener/components/shortener-workbench";
import { ShortenerWorkbenchSkeleton } from "@/modules/shortener/components/shortener-workbench-skeleton";
import { shortenerSearchParamsSchema } from "@/modules/shortener/validation";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/shortener";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("shortener.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("shortener")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ShortenerPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ShortenerToolPage({ params, searchParams }: ShortenerPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("shortener.hero"),
        getTranslations("tools"),
        getShortenerFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeEditable"), Icon: IconRefresh },
        { label: t("badgeProtected"), Icon: IconLock },
        { label: t("badgeExpiring"), Icon: IconClockPause },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("shortener.name"),
                    description: tTools("shortener.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("shortener")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="shortener"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <Suspense fallback={null}>
                    <LinkStateSection searchParams={searchParams} />
                </Suspense>

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ShortenerWorkbenchSkeleton />}>
                        <ShortenerWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ShortenerArticle />
                </Reveal>

                <RelatedTools toolId="shortener" />
            </div>
        </>
    );
}

/**
 * The notice a short link's redirect lands on (`?state=`). Request-time because
 * it reads the URL; renders nothing for a plain visit.
 */
async function LinkStateSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = shortenerSearchParamsSchema.safeParse(await searchParams);
    const linkState = parsed.success ? parsed.data.state : undefined;
    if (linkState === undefined) return null;

    return (
        <FadeIn delay={0.03}>
            <LinkStateNotice state={linkState} />
        </FadeIn>
    );
}

/**
 * The request-time half of the page: reads the prefill from the URL and the
 * request's host for the alias prefix. Everything around it is prerendered.
 */
async function ShortenerWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = shortenerSearchParamsSchema.safeParse(await searchParams);
    const initialTarget = (parsed.success ? parsed.data.url : undefined) ?? "";
    const initialAlias = (parsed.success ? parsed.data.alias : undefined) ?? "";

    // Both halves are read on the server so the panel opens in the right state
    // instead of rendering a control that could never work.
    const storageReady = isShortLinkStorageConfigured();
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    const requestHeaders = await headers();
    // `toolforge.example/s/` or `s.example/` — the scheme is noise in front of a field.
    const redirectBase = linkBases("shortener", SITE_URL, requestHeaders.get("host")).redirect;
    const aliasPrefix = `${redirectBase.replace(/^https?:\/\//, "")}/`;

    return (
        <ShortenerWorkbench
            aliasPrefix={aliasPrefix}
            available={storageReady && turnstileSiteKey !== null}
            storageReady={storageReady}
            turnstileSiteKey={turnstileSiteKey}
            initialTarget={initialTarget}
            initialAlias={initialAlias}
        />
    );
}
