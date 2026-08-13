import { IconDice5, IconMathFunction, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getSecretFaqEntries, SecretArticle } from "@/modules/secret/components/secret-article";
import { SecretWorkbench } from "@/modules/secret/components/secret-workbench";
import { DEFAULT_SECRET_OPTIONS } from "@/modules/secret/domain/constants";
import type { SecretOptions } from "@/modules/secret/types";
import { secretSearchParamsSchema } from "@/modules/secret/validation/generation-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/secret";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("secret.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("secret")?.keywords,
    });
}

type SecretPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SecretToolPage({ searchParams }: SecretPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("secret.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getSecretFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = secretSearchParamsSchema.safeParse(params);
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
                    <SecretWorkbench initialOptions={options} />
                </FadeIn>

                <Reveal>
                    <SecretArticle />
                </Reveal>

                <RelatedTools toolId="secret" />
            </div>
        </>
    );
}
