import {
    IconChevronRight,
    IconLetterCaseToggle,
    IconStack2,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import {
    getTextCaseFaqEntries,
    TextCaseArticle,
} from "@/modules/text-case/components/text-case-article";
import { TextCaseWorkbench } from "@/modules/text-case/components/text-case-workbench";
import { TextCaseWorkbenchSkeleton } from "@/modules/text-case/components/text-case-workbench-skeleton";
import { DEFAULT_TEXT_CASE_OPTIONS } from "@/modules/text-case/domain/constants";
import { textCaseSearchParamsSchema } from "@/modules/text-case/validation/text-case-options";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/text-case";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("textCase.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("text-case")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type TextCasePageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function TextCaseToolPage({ params, searchParams }: TextCasePageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("textCase.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getTextCaseFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeCases"), Icon: IconLetterCaseToggle },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeBulk"), Icon: IconStack2 },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("text-case.name"),
                    description: tTools("text-case.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("text-case")?.keywords,
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
                    <Suspense fallback={<TextCaseWorkbenchSkeleton />}>
                        <TextCaseWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <TextCaseArticle />
                </Reveal>

                <RelatedTools toolId="text-case" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the text and case from the URL.
 * Everything around it is prerendered.
 */
async function TextCaseWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = textCaseSearchParamsSchema.safeParse(await searchParams);
    const text = (parsed.success ? parsed.data.text : undefined) ?? "";
    const initialCase =
        (parsed.success ? parsed.data.case : undefined) ?? DEFAULT_TEXT_CASE_OPTIONS.textCase;

    return <TextCaseWorkbench initialText={text} initialCase={initialCase} />;
}
