import { IconChevronRight, IconShieldLock, IconStopwatch, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getPasswordFaqEntries,
    PasswordArticle,
} from "@/modules/password/components/password-article";
import { PasswordWorkbench } from "@/modules/password/components/password-workbench";
import { DEFAULT_PASSWORD_OPTIONS } from "@/modules/password/domain/constants";
import { clampLength } from "@/modules/password/domain/generate";
import type { PasswordOptions } from "@/modules/password/types";
import { passwordSearchParamsSchema } from "@/modules/password/validation/generation-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/password";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("password.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("password")?.keywords,
    });
}

type PasswordPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PasswordToolPage({ searchParams }: PasswordPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("password.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getPasswordFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = passwordSearchParamsSchema.safeParse(params);
    const link = parsed.success ? parsed.data : {};

    const mode = link.mode ?? DEFAULT_PASSWORD_OPTIONS.mode;
    const options: PasswordOptions = {
        mode,
        // Length and mode arrive as separate params, so the per-mode range can
        // only be applied once both are known. A link asking for 64 words opens
        // on 12 rather than a 500.
        length: clampLength(mode, link.length ?? DEFAULT_PASSWORD_OPTIONS.length),
        uppercase: link.upper ?? DEFAULT_PASSWORD_OPTIONS.uppercase,
        lowercase: link.lower ?? DEFAULT_PASSWORD_OPTIONS.lowercase,
        numbers: link.numbers ?? DEFAULT_PASSWORD_OPTIONS.numbers,
        symbols: link.symbols ?? DEFAULT_PASSWORD_OPTIONS.symbols,
        excludeSimilar: link.noSimilar ?? DEFAULT_PASSWORD_OPTIONS.excludeSimilar,
        excludeAmbiguous: link.noAmbiguous ?? DEFAULT_PASSWORD_OPTIONS.excludeAmbiguous,
        separator: link.separator ?? DEFAULT_PASSWORD_OPTIONS.separator,
        capitalize: link.caps ?? DEFAULT_PASSWORD_OPTIONS.capitalize,
        includeNumber: link.digit ?? DEFAULT_PASSWORD_OPTIONS.includeNumber,
        attack: link.attack ?? DEFAULT_PASSWORD_OPTIONS.attack,
    };

    // Deliberately no password here. Every other generator on the site renders
    // its first result on the server and passes it down; a password must not,
    // because that puts a secret in the HTTP response body — and from there into
    // server logs, a TLS-terminating proxy, and anything that buffered it. The
    // island composes the first one in the browser instead.

    const badges = [
        { label: t("badgeLocal"), Icon: IconWorldOff },
        { label: t("badgeCrypto"), Icon: IconShieldLock },
        { label: t("badgeCrack"), Icon: IconStopwatch },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("password.name"),
                    description: tTools("password.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("password")?.keywords,
                    faqs,
                })}
            />

            <div className="flex min-w-0 flex-col gap-10 lg:gap-12">
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
                    <PasswordWorkbench initialOptions={options} />
                </FadeIn>

                <Reveal>
                    <PasswordArticle />
                </Reveal>

                <RelatedTools toolId="password" />
            </div>
        </>
    );
}
