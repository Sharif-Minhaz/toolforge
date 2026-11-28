import { IconMathFunction, IconStack2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    EquationArticle,
    getEquationFaqEntries,
} from "@/modules/equation/components/equation-article";
import { EquationWorkbench } from "@/modules/equation/components/equation-workbench";
import { EquationWorkbenchSkeleton } from "@/modules/equation/components/equation-workbench-skeleton";
import { DEFAULT_DISPLAY_MODE } from "@/modules/equation/domain/constants";
import { convertTextToLatex } from "@/modules/equation/domain/text-to-latex";
import { isEquationRecognizerConfigured } from "@/modules/equation/repository/math-ocr";
import { equationSearchParamsSchema } from "@/modules/equation/validation/equation";
import type { ConvertedEquation } from "@/modules/equation/types";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/equation";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("equation.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("equation")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type EquationPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function EquationToolPage({ params, searchParams }: EquationPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("equation.hero"),
        getTranslations("tools"),
        getEquationFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeKatex"), Icon: IconMathFunction },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeBulk"), Icon: IconStack2 },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("equation.name"),
                    description: tTools("equation.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("equation")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="equation"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<EquationWorkbenchSkeleton />}>
                        <EquationWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <EquationArticle />
                </Reveal>

                <RelatedTools toolId="equation" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared text from the URL and
 * converts it. Everything around it is prerendered.
 */
async function EquationWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = equationSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : undefined;
    const text = shared?.text ?? "";

    // Converted here rather than in an effect, so a shared link paints its
    // answer on the first frame and hydration has nothing to reconcile. The
    // conversion is pure, so the server and the browser cannot disagree.
    const converted = convertTextToLatex(text);
    const equations: readonly ConvertedEquation[] = converted.ok ? converted.equations : [];

    // Three sources, in the order they should win. The link is the reader's own
    // explicit choice, so it beats everything; failing that, delimiters the
    // shared text arrived wrapped in said what the author meant; failing both,
    // the default. The schema keeps `display` a string so "absent" and "0" stay
    // distinguishable — see `validation/equation.ts`.
    const display =
        shared?.display !== undefined
            ? shared.display === "1"
            : ((converted.ok ? converted.display : null) ?? DEFAULT_DISPLAY_MODE);

    // Both resolved here rather than in the island: whether a worker URL, a key
    // and a Turnstile site key exist is not something the browser can know, and
    // a control that cannot work is worse than an absent one.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;
    const recognizerConfigured = isEquationRecognizerConfigured();

    return (
        <EquationWorkbench
            initialText={text}
            initialDisplay={display}
            initialEquations={equations}
            siteKey={siteKey}
            recognizerConfigured={recognizerConfigured}
        />
    );
}
