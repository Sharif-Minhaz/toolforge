import { IconShieldCheck, IconKey, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { DEFAULT_UUID_QUANTITY, DEFAULT_UUID_VERSION } from "@/modules/uuid/domain/constants";
import { generateUuids } from "@/modules/uuid/domain/generate";
import { getUuidFaqEntries, UuidArticle } from "@/modules/uuid/components/uuid-article";
import { UuidWorkbench } from "@/modules/uuid/components/uuid-workbench";
import { UuidWorkbenchSkeleton } from "@/modules/uuid/components/uuid-workbench-skeleton";
import { uuidSearchParamsSchema } from "@/modules/uuid/validation/generation-options";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/uuid";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("uuid.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("uuid")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type UuidPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function UuidToolPage({ params, searchParams }: UuidPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("uuid.hero"),
        getTranslations("tools"),
        getUuidFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeRfc"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeCrypto"), Icon: IconKey },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("uuid.name"),
                    description: tTools("uuid.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("uuid")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="uuid"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<UuidWorkbenchSkeleton />}>
                        <UuidWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <UuidArticle />
                </Reveal>

                <RelatedTools toolId="uuid" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options and mints fresh
 * UUIDs. Everything around it is prerendered — a UUID baked into that shell
 * would be handed to every visitor.
 */
async function UuidWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = uuidSearchParamsSchema.safeParse(await searchParams);
    const version = (parsed.success ? parsed.data.version : undefined) ?? DEFAULT_UUID_VERSION;
    const quantity = (parsed.success ? parsed.data.quantity : undefined) ?? DEFAULT_UUID_QUANTITY;

    // Generated on the server so the very first paint already carries a result
    // and hydration has nothing to reconcile.
    const initialUuids = generateUuids({ version, quantity });

    return (
        <UuidWorkbench
            initialUuids={initialUuids}
            initialVersion={version}
            initialQuantity={quantity}
        />
    );
}
