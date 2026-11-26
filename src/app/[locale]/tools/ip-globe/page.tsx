import {
    IconChevronRight,
    IconRoute,
    IconShieldCheck,
    IconWorldLatitude,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getIpGlobeFaqEntries,
    IpGlobeArticle,
} from "@/modules/ip-globe/components/ip-globe-article";
import { IpGlobeWorkbench } from "@/modules/ip-globe/components/ip-globe-workbench";
import { IpGlobeWorkbenchSkeleton } from "@/modules/ip-globe/components/ip-globe-workbench-skeleton";
import { DEFAULT_ROUTE_OPTIONS } from "@/modules/ip-globe/domain/constants";
import { isRouteQuotaConfigured } from "@/modules/ip-globe/repository/quota";
import { ipGlobeSearchParamsSchema } from "@/modules/ip-globe/validation/route-request";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/ip-globe";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("ipGlobe.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("ip-globe")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type IpGlobePageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function IpGlobePage({ params, searchParams }: IpGlobePageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("ipGlobe.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getIpGlobeFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeRegistry"), Icon: IconWorldLatitude },
        { label: t("badgeTrace"), Icon: IconRoute },
        { label: t("badgePassive"), Icon: IconShieldCheck },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("ip-globe.name"),
                    description: tTools("ip-globe.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("ip-globe")?.keywords,
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
                        <p className="text-muted-foreground text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
                            >
                                <Icon className="size-3.5" stroke={1.9} aria-hidden="true" />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

                <FadeIn delay={0.06}>
                    <Suspense fallback={<IpGlobeWorkbenchSkeleton />}>
                        <IpGlobeWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <IpGlobeArticle />
                </Reveal>

                <RelatedTools toolId="ip-globe" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: prefills the form from the URL.
 * Everything around it is prerendered.
 */
async function IpGlobeWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = ipGlobeSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : undefined;

    return (
        <IpGlobeWorkbench
            // Prefilled from the link, never run from it: a URL that
            // mapped on arrival would let anybody spend a stranger's
            // allowance by getting them to open it.
            initialInput={link?.host ?? ""}
            initialMode={link?.mode ?? DEFAULT_ROUTE_OPTIONS.mode}
            initialResolver={link?.resolver ?? DEFAULT_ROUTE_OPTIONS.resolver}
            configured={isRouteQuotaConfigured()}
        />
    );
}
