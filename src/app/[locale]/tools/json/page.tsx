import { IconChevronRight, IconShieldCheck, IconTool, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getJsonFaqEntries, JsonArticle } from "@/modules/json/components/json-article";
import { JsonWorkbench } from "@/modules/json/components/json-workbench";
import { JsonWorkbenchSkeleton } from "@/modules/json/components/json-workbench-skeleton";
import { DEFAULT_FORMAT_OPTIONS, DEFAULT_JSON_MODE } from "@/modules/json/domain/constants";
import { formatJson } from "@/modules/json/domain/format";
import { jsonSearchParamsSchema } from "@/modules/json/validation/format-options";
import type { JsonFormatOptions } from "@/modules/json/types";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/json";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("json.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("json")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type JsonPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function JsonToolPage({ params, searchParams }: JsonPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("json.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getJsonFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeSpec"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeFiles"), Icon: IconTool },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("json.name"),
                    description: tTools("json.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("json")?.keywords,
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
                    <Suspense fallback={<JsonWorkbenchSkeleton />}>
                        <JsonWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <JsonArticle />
                </Reveal>

                <RelatedTools toolId="json" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared document and settings
 * from the URL and formats it. Everything around it is prerendered.
 */
async function JsonWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = jsonSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : {};

    const mode = link.mode ?? DEFAULT_JSON_MODE;
    const text = link.text ?? "";
    const options: JsonFormatOptions = {
        indent: link.indent ?? DEFAULT_FORMAT_OPTIONS.indent,
        spec: link.spec ?? DEFAULT_FORMAT_OPTIONS.spec,
        repair: link.repair ?? DEFAULT_FORMAT_OPTIONS.repair,
        sortKeys: link.sortKeys ?? DEFAULT_FORMAT_OPTIONS.sortKeys,
        escapeUnicode: link.escapeUnicode ?? DEFAULT_FORMAT_OPTIONS.escapeUnicode,
    };

    // Cheap here: a shared link caps its document at MAX_SHARED_TEXT_LENGTH, so
    // this is never the megabyte the worker exists for.
    const result = formatJson({ mode, input: text, options });

    return (
        <JsonWorkbench
            initialMode={mode}
            initialText={text}
            initialOptions={options}
            initialResult={result}
        />
    );
}
