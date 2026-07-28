import { IconChevronRight, IconCpu, IconListSearch, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getRegexFaqEntries, RegexArticle } from "@/modules/regex/components/regex-article";
import { RegexWorkbench } from "@/modules/regex/components/regex-workbench";
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
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/regex";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("regex.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("regex")?.keywords,
    });
}

type RegexPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegexToolPage({ searchParams }: RegexPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("regex.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getRegexFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = regexSearchParamsSchema.safeParse(params);
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
                    <RegexWorkbench
                        initialPattern={pattern}
                        initialFlags={flags}
                        initialDelimiter={delimiter}
                        initialMode={mode}
                        initialReplacement={replacement}
                        initialTestString={testString}
                        initialAnalysis={analysis}
                    />
                </FadeIn>

                <Reveal>
                    <RegexArticle />
                </Reveal>
            </div>
        </>
    );
}
