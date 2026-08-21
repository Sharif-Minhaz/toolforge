import { IconChevronRight, IconTable, IconTransform, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getHtmlMarkdownFaqEntries,
    HtmlMarkdownArticle,
} from "@/modules/html-markdown/components/html-markdown-article";
import { HtmlMarkdownWorkbench } from "@/modules/html-markdown/components/html-markdown-workbench";
import {
    DEFAULT_HTML_MARKDOWN_MODE,
    DEFAULT_HTML_MARKDOWN_OPTIONS,
} from "@/modules/html-markdown/domain/constants";
import { convert } from "@/modules/html-markdown/domain/convert";
import type { HtmlMarkdownOptions } from "@/modules/html-markdown/types";
import { htmlMarkdownSearchParamsSchema } from "@/modules/html-markdown/validation/conversion-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/html-markdown";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("htmlMarkdown.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("html-markdown")?.keywords,
    });
}

type HtmlMarkdownPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HtmlMarkdownToolPage({ searchParams }: HtmlMarkdownPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("htmlMarkdown.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getHtmlMarkdownFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = htmlMarkdownSearchParamsSchema.safeParse(params);
    const shared = parsed.success ? parsed.data : {};

    const mode = shared.mode ?? DEFAULT_HTML_MARKDOWN_MODE;
    const text = shared.text ?? "";
    const options: HtmlMarkdownOptions = {
        ...DEFAULT_HTML_MARKDOWN_OPTIONS,
        gfm: shared.gfm ?? DEFAULT_HTML_MARKDOWN_OPTIONS.gfm,
        headingStyle: shared.headingStyle ?? DEFAULT_HTML_MARKDOWN_OPTIONS.headingStyle,
        bulletMarker: shared.bulletMarker ?? DEFAULT_HTML_MARKDOWN_OPTIONS.bulletMarker,
        codeBlockStyle: shared.codeBlockStyle ?? DEFAULT_HTML_MARKDOWN_OPTIONS.codeBlockStyle,
        linkStyle: shared.linkStyle ?? DEFAULT_HTML_MARKDOWN_OPTIONS.linkStyle,
    };

    // Done here rather than in the island, and passed down. See the note on
    // `initialResult` in the workbench: this is the one place where which DOM
    // the converter finds is not a question.
    const initialResult = convert({ mode, text, options });

    const badges = [
        { label: t("badgeGfm"), Icon: IconTable },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeRoundTrip"), Icon: IconTransform },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("html-markdown.name"),
                    description: tTools("html-markdown.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("html-markdown")?.keywords,
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
                    <HtmlMarkdownWorkbench
                        initialMode={mode}
                        initialText={text}
                        initialOptions={options}
                        initialResult={initialResult}
                    />
                </FadeIn>

                <Reveal>
                    <HtmlMarkdownArticle />
                </Reveal>

                <RelatedTools toolId="html-markdown" />
            </div>
        </>
    );
}
