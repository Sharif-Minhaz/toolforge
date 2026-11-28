import { IconFileTypeTxt, IconShieldCheck, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { Base64Article, getBase64FaqEntries } from "@/modules/base64/components/base64-article";
import { Base64Workbench } from "@/modules/base64/components/base64-workbench";
import { Base64WorkbenchSkeleton } from "@/modules/base64/components/base64-workbench-skeleton";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isEncodable } from "@/modules/tools/domain/charsets";
import {
    DEFAULT_BASE64_MODE,
    DEFAULT_CHARSET,
    DEFAULT_ENCODE_OPTIONS,
} from "@/modules/base64/domain/constants";
import { base64SearchParamsSchema } from "@/modules/base64/validation/conversion-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/base64";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("base64.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("base64")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Base64PageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function Base64ToolPage({ params, searchParams }: Base64PageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("base64.hero"),
        getTranslations("tools"),
        getBase64FaqEntries(),
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
                    name: tTools("base64.name"),
                    description: tTools("base64.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("base64")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="base64"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<Base64WorkbenchSkeleton />}>
                        <Base64WorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <Base64Article />
                </Reveal>

                <RelatedTools toolId="base64" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options, so a shared
 * link opens on the text it carries. Everything around it is prerendered.
 */
async function Base64WorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = base64SearchParamsSchema.safeParse(await searchParams);
    const mode = (parsed.success ? parsed.data.mode : undefined) ?? DEFAULT_BASE64_MODE;
    const text = (parsed.success ? parsed.data.text : undefined) ?? "";
    const alphabet =
        (parsed.success ? parsed.data.alphabet : undefined) ?? DEFAULT_ENCODE_OPTIONS.alphabet;
    const requestedCharset = (parsed.success ? parsed.data.charset : undefined) ?? DEFAULT_CHARSET;
    // A link may name a set that can only be read; encoding falls back to UTF-8
    // rather than opening on an error.
    const charset =
        mode === "encode" && !isEncodable(requestedCharset) ? DEFAULT_CHARSET : requestedCharset;

    return (
        <Base64Workbench
            initialMode={mode}
            initialText={text}
            initialAlphabet={alphabet}
            initialCharset={charset}
        />
    );
}
