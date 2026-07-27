import {
    IconChevronRight,
    IconFileTypeTxt,
    IconShieldCheck,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { isEncodable } from "@/modules/tools/domain/charsets";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { UrlArticle, getUrlFaqEntries } from "@/modules/url/components/url-article";
import { UrlWorkbench } from "@/modules/url/components/url-workbench";
import {
    DEFAULT_URL_CHARSET,
    DEFAULT_URL_MODE,
    DEFAULT_URL_PROFILE,
} from "@/modules/url/domain/constants";
import { urlSearchParamsSchema } from "@/modules/url/validation/conversion-options";

const TOOL_PATH = "/tools/url";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("url.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("url")?.keywords,
    });
}

type UrlPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UrlToolPage({ searchParams }: UrlPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("url.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getUrlFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = urlSearchParamsSchema.safeParse(params);
    const mode = (parsed.success ? parsed.data.mode : undefined) ?? DEFAULT_URL_MODE;
    const text = (parsed.success ? parsed.data.text : undefined) ?? "";
    const profile = (parsed.success ? parsed.data.profile : undefined) ?? DEFAULT_URL_PROFILE;
    const requestedCharset =
        (parsed.success ? parsed.data.charset : undefined) ?? DEFAULT_URL_CHARSET;
    // A link may name a set that can only be read; encoding falls back to UTF-8
    // rather than opening on an error.
    const charset =
        mode === "encode" && !isEncodable(requestedCharset)
            ? DEFAULT_URL_CHARSET
            : requestedCharset;

    const badges = [
        { label: t("badgeRfc"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeFiles"), Icon: IconFileTypeTxt },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("url.name"),
                    description: tTools("url.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("url")?.keywords,
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
                    <UrlWorkbench
                        initialMode={mode}
                        initialText={text}
                        initialProfile={profile}
                        initialCharset={charset}
                    />
                </FadeIn>

                <Reveal>
                    <UrlArticle />
                </Reveal>
            </div>
        </>
    );
}
