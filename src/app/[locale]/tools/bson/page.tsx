import { IconShieldCheck, IconTransform, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { BsonArticle, getBsonFaqEntries } from "@/modules/bson/components/bson-article";
import { BsonWorkbench } from "@/modules/bson/components/bson-workbench";
import { BsonWorkbenchSkeleton } from "@/modules/bson/components/bson-workbench-skeleton";
import {
    DEFAULT_CONVERSION_OPTIONS,
    DEFAULT_SOURCE_FORMAT,
    DEFAULT_TARGET_FORMAT,
} from "@/modules/bson/domain/constants";
import { bsonSearchParamsSchema } from "@/modules/bson/validation/conversion-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/bson";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("bson.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("bson")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type BsonPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function BsonToolPage({ params, searchParams }: BsonPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("bson.hero"),
        getTranslations("tools"),
        getBsonFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLossless"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeFormats"), Icon: IconTransform },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("bson.name"),
                    description: tTools("bson.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("bson")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="bson"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<BsonWorkbenchSkeleton />}>
                        <BsonWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <BsonArticle />
                </Reveal>

                <RelatedTools toolId="bson" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options, so a shared
 * link opens on the document it carries. Everything around it is prerendered.
 */
async function BsonWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = bsonSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : undefined;

    const source = link?.from ?? DEFAULT_SOURCE_FORMAT;
    // A link naming the same format on both sides has no conversion in it, so
    // the target falls back rather than opening on a reformat nobody asked for.
    const requestedTarget = link?.to ?? DEFAULT_TARGET_FORMAT;
    const target =
        requestedTarget === source
            ? ((["json", "toon", "bson"] as const).find((format) => format !== source) ??
              DEFAULT_TARGET_FORMAT)
            : requestedTarget;

    const options = {
        bsonEncoding: link?.encoding ?? DEFAULT_CONVERSION_OPTIONS.bsonEncoding,
        ejsonMode: link?.ejson ?? DEFAULT_CONVERSION_OPTIONS.ejsonMode,
        jsonIndent: link?.jsonIndent ?? DEFAULT_CONVERSION_OPTIONS.jsonIndent,
        toonDelimiter: link?.delimiter ?? DEFAULT_CONVERSION_OPTIONS.toonDelimiter,
        toonIndent: link?.toonIndent ?? DEFAULT_CONVERSION_OPTIONS.toonIndent,
        toonStrict: DEFAULT_CONVERSION_OPTIONS.toonStrict,
    };

    return (
        <BsonWorkbench
            initialSource={source}
            initialTarget={target}
            initialInput={link?.input ?? ""}
            initialOptions={options}
        />
    );
}
