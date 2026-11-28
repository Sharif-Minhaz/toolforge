import { IconShieldLock, IconStopwatch, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getPasswordFaqEntries,
    PasswordArticle,
} from "@/modules/password/components/password-article";
import { PasswordWorkbench } from "@/modules/password/components/password-workbench";
import { PasswordWorkbenchSkeleton } from "@/modules/password/components/password-workbench-skeleton";
import { DEFAULT_PASSWORD_OPTIONS } from "@/modules/password/domain/constants";
import { clampLength } from "@/modules/password/domain/generate";
import type { PasswordOptions } from "@/modules/password/types";
import { passwordSearchParamsSchema } from "@/modules/password/validation/generation-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/password";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("password.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("password")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type PasswordPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function PasswordToolPage({ params, searchParams }: PasswordPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("password.hero"),
        getTranslations("tools"),
        getPasswordFaqEntries(),
        getLocale(),
    ]);

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
                <ToolPageHeader
                    toolId="password"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<PasswordWorkbenchSkeleton />}>
                        <PasswordWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <PasswordArticle />
                </Reveal>

                <RelatedTools toolId="password" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options. Everything
 * around it is prerendered; no password is generated here or anywhere on the
 * server (see below).
 */
async function PasswordWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = passwordSearchParamsSchema.safeParse(await searchParams);
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

    return <PasswordWorkbench initialOptions={options} />;
}
