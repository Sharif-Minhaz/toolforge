import { IconKey, IconTopologyStar3, IconTransform } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getServerOverview } from "@/modules/graphql-server/actions/servers";
import {
    getGraphqlServerFaqEntries,
    GraphqlServerArticle,
} from "@/modules/graphql-server/components/graphql-server-article";
import { ServerLauncher } from "@/modules/graphql-server/components/server-launcher";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const SECTION_PATH = "/graphql";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("graphqlServer.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: SECTION_PATH,
        locale,
        keywords: getToolById("graphql-server")?.keywords,
    });
}

/**
 * The way in to the GraphQL Server Studio. Everything interactive is one
 * island; the header and the article around it stay on the server.
 */
export default async function GraphqlServerStudioPage({ params }: { params: LocaleParams }) {
    await enterLocale(params);
    const [t, tTools, overview, faqs, locale] = await Promise.all([
        getTranslations("graphqlServer.hero"),
        getTranslations("tools"),
        getServerOverview(),
        getGraphqlServerFaqEntries(),
        getLocale(),
    ]);

    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    const badges = [
        { label: t("badgeSchema"), Icon: IconTopologyStar3 },
        { label: t("badgeRelations"), Icon: IconTransform },
        { label: t("badgeRecovery"), Icon: IconKey },
    ];

    return (
        <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("graphql-server.name"),
                    description: tTools("graphql-server.description"),
                    path: SECTION_PATH,
                    locale,
                    keywords: getToolById("graphql-server")?.keywords,
                    faqs,
                })}
            />

            <FadeIn>
                <header className="flex flex-col gap-3">
                    <p className="text-muted-foreground text-xs font-medium">{t("eyebrow")}</p>
                    <h1 className="text-foreground text-2xl leading-[1.2] font-semibold text-balance sm:text-3xl">
                        {t("title")}
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">{t("subtitle")}</p>

                    <ul className="mt-1 flex flex-wrap gap-2">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="border-border/70 bg-card text-muted-foreground flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.6875rem] leading-[1.3]"
                            >
                                <Icon
                                    className="size-3.5 shrink-0"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {label}
                            </li>
                        ))}
                    </ul>
                </header>
            </FadeIn>

            <Reveal>
                <ServerLauncher overview={overview} turnstileSiteKey={turnstileSiteKey} />
            </Reveal>

            <Reveal className="mt-4">
                <GraphqlServerArticle />
            </Reveal>
        </div>
    );
}
