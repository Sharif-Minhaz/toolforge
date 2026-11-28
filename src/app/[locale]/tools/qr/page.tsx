import { IconQrcode, IconScan, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getQrFaqEntries, QrArticle } from "@/modules/qr/components/qr-article";
import { QrWorkbench } from "@/modules/qr/components/qr-workbench";
import { QrWorkbenchSkeleton } from "@/modules/qr/components/qr-workbench-skeleton";
import {
    DEFAULT_DRAFT,
    DEFAULT_OPTIONS,
    DEFAULT_PAYLOAD_KIND,
} from "@/modules/qr/domain/constants";
import { LinkStateNotice } from "@/modules/short-links/components/link-state-notice";
import { isShortLinkStorageConfigured } from "@/modules/short-links/repository/config";
import { linkStateSchema } from "@/modules/short-links/validation";
import { qrSearchParamsSchema } from "@/modules/qr/validation/qr-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/qr";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("qr.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("qr")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type QrPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function QrToolPage({ params, searchParams }: QrPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("qr.hero"),
        getTranslations("tools"),
        getQrFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeTypes"), Icon: IconQrcode },
        { label: t("badgeReader"), Icon: IconScan },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("qr.name"),
                    description: tTools("qr.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("qr")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="qr"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <Suspense fallback={null}>
                    <QrLinkStateSection searchParams={searchParams} />
                </Suspense>

                <FadeIn delay={0.06}>
                    <Suspense fallback={<QrWorkbenchSkeleton />}>
                        <QrWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <QrArticle />
                </Reveal>

                <RelatedTools toolId="qr" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the kind, payload and styling a
 * shared link names. Everything around it is prerendered.
 */
async function QrWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = qrSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : {};

    const kind = shared.kind ?? DEFAULT_PAYLOAD_KIND;
    // A shared link fills the field belonging to the kind it named, so
    // `?kind=text&text=hello` opens on the text form already filled in.
    const draft =
        shared.text === undefined
            ? DEFAULT_DRAFT
            : kind === "text"
              ? { ...DEFAULT_DRAFT, text: shared.text }
              : kind === "url"
                ? { ...DEFAULT_DRAFT, url: shared.text }
                : DEFAULT_DRAFT;

    const options = {
        ...DEFAULT_OPTIONS,
        level: shared.level ?? DEFAULT_OPTIONS.level,
        dotStyle: shared.dots ?? DEFAULT_OPTIONS.dotStyle,
        eyeStyle: shared.eyes ?? DEFAULT_OPTIONS.eyeStyle,
        foreground: shared.fg ?? DEFAULT_OPTIONS.foreground,
        background: shared.bg ?? DEFAULT_OPTIONS.background,
    };

    // Read on the server and handed down, so the island never touches
    // `process.env` and an unconfigured deployment says so rather than offering
    // a control that could never work.
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;
    const dynamicStorageReady = isShortLinkStorageConfigured();

    return (
        <QrWorkbench
            initialKind={kind}
            initialDraft={draft}
            initialOptions={options}
            turnstileSiteKey={turnstileSiteKey}
            dynamicStorageReady={dynamicStorageReady}
        />
    );
}

/** Request-time too: the notice depends on the `state` the redirect route put in the URL. */
async function QrLinkStateSection({ searchParams }: { searchParams: SearchParams }) {
    // Set by the redirect route when a scanned short link had nowhere to send
    // the visitor — never existed, not live yet, or already over.
    const linkState = linkStateSchema.parse((await searchParams).state);

    if (linkState === undefined) return null;

    return (
        <FadeIn delay={0.03}>
            <LinkStateNotice state={linkState} />
        </FadeIn>
    );
}
