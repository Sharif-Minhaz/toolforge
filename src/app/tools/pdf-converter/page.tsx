import { IconChevronRight, IconFileTypePdf, IconTextSize, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getPdfConverterFaqEntries,
    PdfConverterArticle,
} from "@/modules/pdf-converter/components/pdf-converter-article";
import { PdfConverterWorkbench } from "@/modules/pdf-converter/components/pdf-converter-workbench";
import {
    DEFAULT_PDF_OPTIONS,
    DEFAULT_PDF_PASTE_FORMAT,
} from "@/modules/pdf-converter/domain/constants";
import { convertText } from "@/modules/pdf-converter/domain/convert";
import type { PdfConverterOptions, PdfPasteableFormat } from "@/modules/pdf-converter/types";
import { pdfConverterSearchParamsSchema } from "@/modules/pdf-converter/validation/converter-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/pdf-converter";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("pdfConverter.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("pdf-converter")?.keywords,
    });
}

type PdfConverterPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PdfConverterToolPage({ searchParams }: PdfConverterPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("pdfConverter.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getPdfConverterFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = pdfConverterSearchParamsSchema.safeParse(params);
    const shared = parsed.success ? parsed.data : {};

    // Only a pasteable format can arrive in a link: a `.docx` has no
    // representation in a query string, so a shared link always opens on the
    // paste panel with whichever of the three notations it named.
    const format: PdfPasteableFormat = shared.format ?? DEFAULT_PDF_PASTE_FORMAT;
    const text = shared.text ?? "";
    const options: PdfConverterOptions = {
        ...DEFAULT_PDF_OPTIONS,
        pageSize: shared.pageSize ?? DEFAULT_PDF_OPTIONS.pageSize,
        orientation: shared.orientation ?? DEFAULT_PDF_OPTIONS.orientation,
        margin: shared.margin ?? DEFAULT_PDF_OPTIONS.margin,
        fontSize: shared.fontSize ?? DEFAULT_PDF_OPTIONS.fontSize,
        pageNumbers: shared.pageNumbers ?? DEFAULT_PDF_OPTIONS.pageNumbers,
        includeImages: shared.includeImages ?? DEFAULT_PDF_OPTIONS.includeImages,
        showLinkUrls: shared.showLinkUrls ?? DEFAULT_PDF_OPTIONS.showLinkUrls,
    };

    // Done here and passed down, so the server-rendered pass already holds the
    // summary the island would otherwise compute on its first render. Pure and
    // deterministic — nothing in this path reads a DOM or a clock.
    const initialResult = convertText({ format, text, options });

    const badges = [
        { label: t("badgeFormats"), Icon: IconFileTypePdf },
        { label: t("badgeText"), Icon: IconTextSize },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("pdf-converter.name"),
                    description: tTools("pdf-converter.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("pdf-converter")?.keywords,
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
                    <PdfConverterWorkbench
                        initialFormat={format}
                        initialText={text}
                        initialOptions={options}
                        initialResult={initialResult}
                    />
                </FadeIn>

                <Reveal>
                    <PdfConverterArticle />
                </Reveal>

                <RelatedTools toolId="pdf-converter" />
            </div>
        </>
    );
}
