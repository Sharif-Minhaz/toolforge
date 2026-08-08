import { IconChevronRight, IconCertificate, IconFileText, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getRsaFaqEntries, RsaArticle } from "@/modules/rsa/components/rsa-article";
import { RsaWorkbench } from "@/modules/rsa/components/rsa-workbench";
import { DEFAULT_RSA_OPTIONS } from "@/modules/rsa/domain/constants";
import { rsaSearchParamsSchema } from "@/modules/rsa/validation/rsa-options";
import type { RsaOptions } from "@/modules/rsa/types";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/rsa";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("rsa.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("rsa")?.keywords,
    });
}

type RsaPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RsaToolPage({ searchParams }: RsaPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("rsa.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getRsaFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = rsaSearchParamsSchema.safeParse(params);
    const read = parsed.success ? parsed.data : undefined;

    /**
     * Options only. No key material is generated here and none ever will be: a
     * private key minted on the server would have to cross the network to reach
     * the person it belongs to, which is the one thing a key generator must not
     * do. The workbench opens empty and the first key is minted by the press, in
     * the reader's own tab.
     */
    const options: RsaOptions = {
        ...DEFAULT_RSA_OPTIONS,
        keySize: read?.keySize ?? DEFAULT_RSA_OPTIONS.keySize,
        usage: read?.usage ?? DEFAULT_RSA_OPTIONS.usage,
        hash: read?.hash ?? DEFAULT_RSA_OPTIONS.hash,
        keyFormat: read?.keyFormat ?? DEFAULT_RSA_OPTIONS.keyFormat,
        outputFormat: read?.outputFormat ?? DEFAULT_RSA_OPTIONS.outputFormat,
        publicExponent: read?.publicExponent ?? DEFAULT_RSA_OPTIONS.publicExponent,
    };

    const badges = [
        { label: t("badgeFormats"), Icon: IconFileText },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeSizes"), Icon: IconCertificate },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("rsa.name"),
                    description: tTools("rsa.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("rsa")?.keywords,
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
                    <RsaWorkbench initialOptions={options} />
                </FadeIn>

                <Reveal>
                    <RsaArticle />
                </Reveal>

                <RelatedTools toolId="rsa" />
            </div>
        </>
    );
}
