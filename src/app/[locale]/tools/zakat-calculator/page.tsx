import { IconCoins, IconScale, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { getZonedFields } from "@/modules/tools/domain/zone";
import { ZakatArticle, getZakatFaqEntries } from "@/modules/zakat/components/zakat-article";
import { ZakatWorkbench } from "@/modules/zakat/components/zakat-workbench";
import { ZakatWorkbenchSkeleton } from "@/modules/zakat/components/zakat-workbench-skeleton";
import { DEFAULT_CURRENCY } from "@/modules/zakat/domain/constants";
import { isPriceBasisAvailable } from "@/modules/zakat/domain/form";
import { DEFAULT_RULES, VIEW_RULES } from "@/modules/zakat/domain/rules";
import { getPriceSnapshot } from "@/modules/zakat/repository/prices";
import { zakatSearchParamsSchema } from "@/modules/zakat/validation/zakat-options";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/zakat-calculator";

/** The date a hawl is counted against: Bangladesh's, as the Age Calculator uses. */
const REFERENCE_TIME_ZONE = "Asia/Dhaka";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("zakat.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("zakat-calculator")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ZakatPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ZakatCalculatorPage({ params, searchParams }: ZakatPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("zakat.hero"),
        getTranslations("tools"),
        getZakatFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgePrices"), Icon: IconCoins },
        { label: t("badgeViews"), Icon: IconScale },
        { label: t("badgeLocal"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("zakat-calculator.name"),
                    description: tTools("zakat-calculator.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("zakat-calculator")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="zakat-calculator"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ZakatWorkbenchSkeleton />}>
                        <ZakatWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ZakatArticle />
                </Reveal>

                <RelatedTools toolId="zakat-calculator" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: the settings a shared link names, the
 * day's prices and today's date. Prices are read through their own caches
 * (`repository/prices.ts`) — at most once a quarter of an hour for the whole
 * site — and handed down as a snapshot, so the server render and hydration
 * compute the same figure. Today is Bangladesh's date, read once here, for the
 * hawl: a clock read in the island would differ across hydration.
 */
async function ZakatWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = zakatSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : {};
    const snapshot = await getPriceSnapshot();
    // Read once, after the request data, the way the age calculator does.
    const now = new Date();
    const { year, month, day } = getZonedFields(now.getTime(), REFERENCE_TIME_ZONE);

    return (
        <ZakatWorkbench
            snapshot={snapshot}
            today={{ year, month, day }}
            initialCurrency={shared.currency ?? DEFAULT_CURRENCY}
            initialRules={shared.view === undefined ? DEFAULT_RULES : VIEW_RULES[shared.view]}
            // A link naming a source that did not answer today opens on the
            // default instead, rather than on a refusal.
            initialPriceBasis={
                shared.price !== undefined && isPriceBasisAvailable(shared.price, snapshot)
                    ? shared.price
                    : null
            }
        />
    );
}
