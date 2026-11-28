import { IconDice5, IconMathFunction, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getSecretFaqEntries, SecretArticle } from "@/modules/secret/components/secret-article";
import { SecretWorkbench } from "@/modules/secret/components/secret-workbench";
import { SecretWorkbenchSkeleton } from "@/modules/secret/components/secret-workbench-skeleton";
import { DEFAULT_SECRET_OPTIONS } from "@/modules/secret/domain/constants";
import type { SecretOptions } from "@/modules/secret/types";
import { secretSearchParamsSchema } from "@/modules/secret/validation/generation-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/secret";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("secret.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("secret")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type SecretPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function SecretToolPage({ params, searchParams }: SecretPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("secret.hero"),
        getTranslations("tools"),
        getSecretFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLocal"), Icon: IconWorldOff },
        { label: t("badgeCrypto"), Icon: IconDice5 },
        { label: t("badgeExact"), Icon: IconMathFunction },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("secret.name"),
                    description: tTools("secret.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("secret")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="secret"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<SecretWorkbenchSkeleton />}>
                        <SecretWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <SecretArticle />
                </Reveal>

                <RelatedTools toolId="secret" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the options from the URL. Everything
 * around it is prerendered; the secret itself is drawn in the browser (see
 * below).
 */
async function SecretWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = secretSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : {};

    const options: SecretOptions = {
        byteLength: link.bytes ?? DEFAULT_SECRET_OPTIONS.byteLength,
        encoding: link.encoding ?? DEFAULT_SECRET_OPTIONS.encoding,
        padded: link.padded ?? DEFAULT_SECRET_OPTIONS.padded,
        shape: link.shape ?? DEFAULT_SECRET_OPTIONS.shape,
        variableName: link.name ?? DEFAULT_SECRET_OPTIONS.variableName,
    };

    // Deliberately no secret here. Most generators on the site render their
    // first result on the server and pass it down; a key must not, because that
    // puts it in the HTTP response body — and from there into server logs, a
    // TLS-terminating proxy, and anything that buffered it. The island draws
    // the first one in the browser instead.

    return <SecretWorkbench initialOptions={options} />;
}
