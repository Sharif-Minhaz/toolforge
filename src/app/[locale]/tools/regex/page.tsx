import { IconCpu, IconListSearch, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getRegexFaqEntries, RegexArticle } from "@/modules/regex/components/regex-article";
import { RegexWorkbench } from "@/modules/regex/components/regex-workbench";
import { RegexWorkbenchSkeleton } from "@/modules/regex/components/regex-workbench-skeleton";
import { analyzeRegex } from "@/modules/regex/domain/analyze";
import {
    DEFAULT_REGEX_DELIMITER,
    DEFAULT_REGEX_FLAGS,
    DEFAULT_REGEX_MODE,
    DEFAULT_REPLACEMENT,
    SAMPLE_PATTERN,
    SAMPLE_TEST_STRING,
} from "@/modules/regex/domain/constants";
import { regexSearchParamsSchema } from "@/modules/regex/validation/regex-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/regex";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("regex.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("regex")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type RegexPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function RegexToolPage({ params, searchParams }: RegexPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("regex.hero"),
        getTranslations("tools"),
        getRegexFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeEngine"), Icon: IconCpu },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeExplain"), Icon: IconListSearch },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("regex.name"),
                    description: tTools("regex.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("regex")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="regex"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<RegexWorkbenchSkeleton />}>
                        <RegexWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <RegexArticle />
                </Reveal>

                <RelatedTools toolId="regex" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared pattern and
 * input from the URL and analyses them. Everything around it is prerendered.
 */
async function RegexWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = regexSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : {};

    // A link that names a pattern brings its own input; one that does not opens
    // on the sample, so the tool demonstrates itself on the first paint.
    const shared = link.pattern !== undefined;
    const pattern = link.pattern ?? SAMPLE_PATTERN;
    const flags = link.flags ?? DEFAULT_REGEX_FLAGS;
    const delimiter = link.delimiter ?? DEFAULT_REGEX_DELIMITER;
    const mode = link.mode ?? DEFAULT_REGEX_MODE;
    const replacement = link.replacement ?? DEFAULT_REPLACEMENT;
    const testString = link.test ?? (shared ? "" : SAMPLE_TEST_STRING);

    // Run on the server so the first paint already shows matches, highlighting,
    // and the explanation — the worker only takes over from the next keystroke.
    const analysis = analyzeRegex({ pattern, flags, mode, replacement, testString });

    return (
        <RegexWorkbench
            initialPattern={pattern}
            initialFlags={flags}
            initialDelimiter={delimiter}
            initialMode={mode}
            initialReplacement={replacement}
            initialTestString={testString}
            initialAnalysis={analysis}
        />
    );
}
