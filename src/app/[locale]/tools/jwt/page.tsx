import { IconKey, IconShieldCheck, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { DEFAULT_JWT_ALGORITHM, DEFAULT_JWT_MODE } from "@/modules/jwt/domain/constants";
import { createJwtExample, type JwtExample } from "@/modules/jwt/domain/examples";
import { getJwtFaqEntries, JwtArticle } from "@/modules/jwt/components/jwt-article";
import { JwtWorkbench } from "@/modules/jwt/components/jwt-workbench";
import { JwtWorkbenchSkeleton } from "@/modules/jwt/components/jwt-workbench-skeleton";
import type { JwtAlgorithm } from "@/modules/jwt/types";
import { jwtSearchParamsSchema } from "@/modules/jwt/validation/jwt-options";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/jwt";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("jwt.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("jwt")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type JwtPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

/**
 * A worked example, signed here so the first paint is a real token rather than
 * an empty box. HMAC signing is a single hash, and the result is plain strings,
 * so it crosses the RSC boundary as props and hydration has nothing to redo.
 */
async function buildInitialExample(
    algorithm: JwtAlgorithm,
    issuedAt: Date,
): Promise<JwtExample | null> {
    try {
        const result = await createJwtExample({ algorithm, issuedAt });

        return result.ok ? result.example : null;
    } catch (caught) {
        logEvent("error", "jwt.initial_example_failed", {
            algorithm,
            error: describeError(caught),
        });

        return null;
    }
}

export default async function JwtToolPage({ params, searchParams }: JwtPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("jwt.hero"),
        getTranslations("tools"),
        getJwtFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeRfc"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeAlgorithms"), Icon: IconKey },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("jwt.name"),
                    description: tTools("jwt.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("jwt")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="jwt"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<JwtWorkbenchSkeleton />}>
                        <JwtWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <JwtArticle />
                </Reveal>

                <RelatedTools toolId="jwt" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options and the clock, and
 * signs the worked example at the current time. Everything around it is
 * prerendered — a token baked into that shell would carry the build's clock.
 */
async function JwtWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = jwtSearchParamsSchema.safeParse(await searchParams);
    const mode = (parsed.success ? parsed.data.mode : undefined) ?? DEFAULT_JWT_MODE;
    const algorithm = (parsed.success ? parsed.data.alg : undefined) ?? DEFAULT_JWT_ALGORITHM;
    const now = new Date();
    const example = await buildInitialExample(algorithm, now);

    return <JwtWorkbench initialMode={mode} initialNow={now.toISOString()} example={example} />;
}
