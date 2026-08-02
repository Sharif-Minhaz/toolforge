import { IconChevronRight, IconKey, IconShieldCheck, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { DEFAULT_JWT_ALGORITHM, DEFAULT_JWT_MODE } from "@/modules/jwt/domain/constants";
import { createJwtExample, type JwtExample } from "@/modules/jwt/domain/examples";
import { getJwtFaqEntries, JwtArticle } from "@/modules/jwt/components/jwt-article";
import { JwtWorkbench } from "@/modules/jwt/components/jwt-workbench";
import type { JwtAlgorithm } from "@/modules/jwt/types";
import { jwtSearchParamsSchema } from "@/modules/jwt/validation/jwt-options";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/jwt";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("jwt.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("jwt")?.keywords,
    });
}

type JwtPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
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

export default async function JwtToolPage({ searchParams }: JwtPageProps) {
    const now = new Date();
    const parsed = jwtSearchParamsSchema.safeParse(await searchParams);
    const mode = (parsed.success ? parsed.data.mode : undefined) ?? DEFAULT_JWT_MODE;
    const algorithm = (parsed.success ? parsed.data.alg : undefined) ?? DEFAULT_JWT_ALGORITHM;

    const [t, tTools, tNav, faqs, locale, example] = await Promise.all([
        getTranslations("jwt.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getJwtFaqEntries(),
        getLocale(),
        buildInitialExample(algorithm, now),
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
                    <JwtWorkbench
                        initialMode={mode}
                        initialNow={now.toISOString()}
                        example={example}
                    />
                </FadeIn>

                <Reveal>
                    <JwtArticle />
                </Reveal>

                <RelatedTools toolId="jwt" />
            </div>
        </>
    );
}
