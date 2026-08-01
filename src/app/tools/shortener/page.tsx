import { IconChevronRight, IconClockPause, IconLock, IconRefresh } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { SITE_URL } from "@/modules/seo/domain/site";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { LinkStateNotice } from "@/modules/short-links/components/link-state-notice";
import { SHORTENER_REDIRECT_PREFIX } from "@/modules/short-links/domain/constants";
import { isShortLinkStorageConfigured } from "@/modules/short-links/repository/config";
import {
    getShortenerFaqEntries,
    ShortenerArticle,
} from "@/modules/shortener/components/shortener-article";
import { ShortenerWorkbench } from "@/modules/shortener/components/shortener-workbench";
import { shortenerSearchParamsSchema } from "@/modules/shortener/validation";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/shortener";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("shortener.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("shortener")?.keywords,
    });
}

type ShortenerPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ShortenerToolPage({ searchParams }: ShortenerPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("shortener.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getShortenerFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = shortenerSearchParamsSchema.safeParse(params);
    const initialTarget = (parsed.success ? parsed.data.url : undefined) ?? "";
    const initialAlias = (parsed.success ? parsed.data.alias : undefined) ?? "";
    const linkState = parsed.success ? parsed.data.state : undefined;

    // Both halves are read on the server so the panel opens in the right state
    // instead of rendering a control that could never work.
    const storageReady = isShortLinkStorageConfigured();
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    // `toolforge.example/s/` — the scheme is noise in front of a field.
    const aliasPrefix = `${SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}${SHORTENER_REDIRECT_PREFIX}/`;

    const badges = [
        { label: t("badgeEditable"), Icon: IconRefresh },
        { label: t("badgeProtected"), Icon: IconLock },
        { label: t("badgeExpiring"), Icon: IconClockPause },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("shortener.name"),
                    description: tTools("shortener.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("shortener")?.keywords,
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

                {linkState !== undefined && (
                    <FadeIn delay={0.03}>
                        <LinkStateNotice state={linkState} />
                    </FadeIn>
                )}

                <FadeIn delay={0.06}>
                    <ShortenerWorkbench
                        aliasPrefix={aliasPrefix}
                        available={storageReady && turnstileSiteKey !== null}
                        storageReady={storageReady}
                        turnstileSiteKey={turnstileSiteKey}
                        initialTarget={initialTarget}
                        initialAlias={initialAlias}
                    />
                </FadeIn>

                <Reveal>
                    <ShortenerArticle />
                </Reveal>
            </div>
        </>
    );
}
