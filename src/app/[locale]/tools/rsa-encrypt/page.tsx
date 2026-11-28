import { IconFileText, IconLockCode, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getRsaCryptFaqEntries,
    RsaCryptArticle,
} from "@/modules/rsa-encrypt/components/rsa-crypt-article";
import { RsaCryptWorkbench } from "@/modules/rsa-encrypt/components/rsa-crypt-workbench";
import { RsaCryptWorkbenchSkeleton } from "@/modules/rsa-encrypt/components/rsa-crypt-workbench-skeleton";
import {
    DEFAULT_RSA_CRYPT_DIRECTION,
    DEFAULT_RSA_CRYPT_OPTIONS,
} from "@/modules/rsa-encrypt/domain/constants";
import { requiredKeyKind } from "@/modules/rsa-encrypt/domain/options";
import type { RsaCryptOptions } from "@/modules/rsa-encrypt/types";
import { rsaCryptSearchParamsSchema } from "@/modules/rsa-encrypt/validation/rsa-crypt-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/rsa-encrypt";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("rsaEncrypt.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("rsa-encrypt")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type RsaEncryptPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function RsaEncryptToolPage({ params, searchParams }: RsaEncryptPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("rsaEncrypt.hero"),
        getTranslations("tools"),
        getRsaCryptFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgePadding"), Icon: IconLockCode },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeFormats"), Icon: IconFileText },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("rsa-encrypt.name"),
                    description: tTools("rsa-encrypt.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("rsa-encrypt")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="rsa-encrypt"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<RsaCryptWorkbenchSkeleton />}>
                        <RsaCryptWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <RsaCryptArticle />
                </Reveal>

                <RelatedTools toolId="rsa-encrypt" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the direction and the options from
 * the URL. Everything around it is prerendered.
 */
async function RsaCryptWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = rsaCryptSearchParamsSchema.safeParse(await searchParams);
    const read = parsed.success ? parsed.data : undefined;

    const direction = read?.direction ?? DEFAULT_RSA_CRYPT_DIRECTION;

    /**
     * Options only. No key and no payload has a search parameter at all — a URL
     * lands in browser history, in access logs and in the `Referer` header of
     * every outbound link on the page, which is the last place either belongs.
     *
     * The key kind is coerced rather than trusted: a link asking to decrypt with
     * a public key describes something that cannot happen, and opening on a
     * default beats opening on an error.
     */
    const options: RsaCryptOptions = {
        ...DEFAULT_RSA_CRYPT_OPTIONS,
        keyFormat: read?.keyFormat ?? DEFAULT_RSA_CRYPT_OPTIONS.keyFormat,
        keyKind: requiredKeyKind(direction, read?.keyKind ?? DEFAULT_RSA_CRYPT_OPTIONS.keyKind),
        hash: read?.hash ?? DEFAULT_RSA_CRYPT_OPTIONS.hash,
        textEncoding: read?.textEncoding ?? DEFAULT_RSA_CRYPT_OPTIONS.textEncoding,
        cipherEncoding: read?.cipherEncoding ?? DEFAULT_RSA_CRYPT_OPTIONS.cipherEncoding,
    };

    return <RsaCryptWorkbench initialDirection={direction} initialOptions={options} />;
}
