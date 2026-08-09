import { IconChevronRight, IconFileText, IconLockCode, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getRsaCryptFaqEntries,
    RsaCryptArticle,
} from "@/modules/rsa-encrypt/components/rsa-crypt-article";
import { RsaCryptWorkbench } from "@/modules/rsa-encrypt/components/rsa-crypt-workbench";
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

const TOOL_PATH = "/tools/rsa-encrypt";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("rsaEncrypt.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("rsa-encrypt")?.keywords,
    });
}

type RsaEncryptPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RsaEncryptToolPage({ searchParams }: RsaEncryptPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("rsaEncrypt.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getRsaCryptFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = rsaCryptSearchParamsSchema.safeParse(params);
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
                <FadeIn className="flex flex-col gap-4">
                    <nav aria-label={tNav("breadcrumb")}>
                        <ol className="text-muted-foreground flex items-center gap-1 text-xs">
                            <li>
                                <Link
                                    href="/"
                                    className="hover:text-foreground focus-visible:ring-ring rounded transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                                >
                                    {tNav("overview")}
                                </Link>
                            </li>
                            <li aria-hidden="true">
                                <IconChevronRight className="size-3.5" stroke={2} />
                            </li>
                            <li className="text-foreground">{t("eyebrow")}</li>
                        </ol>
                    </nav>

                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            {t("title")}
                        </h1>
                        <p className="text-muted-foreground max-w-2xl text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
                            >
                                <Icon
                                    className="text-primary size-3.5"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

                <FadeIn delay={0.06}>
                    <RsaCryptWorkbench initialDirection={direction} initialOptions={options} />
                </FadeIn>

                <Reveal>
                    <RsaCryptArticle />
                </Reveal>

                <RelatedTools toolId="rsa-encrypt" />
            </div>
        </>
    );
}
