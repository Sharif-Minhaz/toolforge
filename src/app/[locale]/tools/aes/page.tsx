import { IconShieldCheck, IconKey, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { AesArticle, getAesFaqEntries } from "@/modules/aes/components/aes-article";
import { AesWorkbench } from "@/modules/aes/components/aes-workbench";
import { AesWorkbenchSkeleton } from "@/modules/aes/components/aes-workbench-skeleton";
import { DEFAULT_AES_DIRECTION, DEFAULT_AES_OPTIONS } from "@/modules/aes/domain/constants";
import { randomIvHex, randomSaltHex } from "@/modules/aes/domain/params";
import { aesSearchParamsSchema } from "@/modules/aes/validation/aes-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import type { AesOptions } from "@/modules/aes/types";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/aes";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("aes.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("aes")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type AesPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function AesToolPage({ params, searchParams }: AesPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("aes.hero"),
        getTranslations("tools"),
        getAesFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeModes"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeKdf"), Icon: IconKey },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("aes.name"),
                    description: tTools("aes.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("aes")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="aes"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<AesWorkbenchSkeleton />}>
                        <AesWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <AesArticle />
                </Reveal>

                <RelatedTools toolId="aes" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options and draws a
 * fresh salt and IV. Everything around it is prerendered — a salt baked into
 * that shell would be handed to every visitor.
 */
async function AesWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = aesSearchParamsSchema.safeParse(await searchParams);
    const read = parsed.success ? parsed.data : undefined;

    const direction = read?.direction ?? DEFAULT_AES_DIRECTION;
    const mode = read?.mode ?? DEFAULT_AES_OPTIONS.mode;

    // Drawn here, on the server, and handed down as props. A random value in a
    // `useState` initialiser differs between the server pass and the client,
    // and hydration breaks on the first paint.
    const options: AesOptions = {
        ...DEFAULT_AES_OPTIONS,
        mode,
        keySize: read?.keySize ?? DEFAULT_AES_OPTIONS.keySize,
        keySource: read?.keySource ?? DEFAULT_AES_OPTIONS.keySource,
        iterations: read?.iterations ?? DEFAULT_AES_OPTIONS.iterations,
        textEncoding: read?.textEncoding ?? DEFAULT_AES_OPTIONS.textEncoding,
        cipherEncoding: read?.cipherEncoding ?? DEFAULT_AES_OPTIONS.cipherEncoding,
        saltHex: randomSaltHex(),
        ivHex: randomIvHex(mode),
    };

    return <AesWorkbench initialDirection={direction} initialOptions={options} />;
}
