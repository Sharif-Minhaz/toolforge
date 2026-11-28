import { IconFileTypePdf, IconTextSize, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getPdfConverterFaqEntries,
    PdfConverterArticle,
} from "@/modules/pdf-converter/components/pdf-converter-article";
import { PdfConverterWorkbench } from "@/modules/pdf-converter/components/pdf-converter-workbench";
import { PdfConverterWorkbenchSkeleton } from "@/modules/pdf-converter/components/pdf-converter-workbench-skeleton";
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
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/pdf-converter";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("pdfConverter.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("pdf-converter")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type PdfConverterPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function PdfConverterToolPage({
    params,
    searchParams,
}: PdfConverterPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("pdfConverter.hero"),
        getTranslations("tools"),
        getPdfConverterFaqEntries(),
        getLocale(),
    ]);

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
                <ToolPageHeader
                    toolId="pdf-converter"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<PdfConverterWorkbenchSkeleton />}>
                        <PdfConverterWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <PdfConverterArticle />
                </Reveal>

                <RelatedTools toolId="pdf-converter" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared format, text
 * and layout from the URL and converts it. Everything around it is prerendered.
 */
async function PdfConverterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = pdfConverterSearchParamsSchema.safeParse(await searchParams);
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

    return (
        <PdfConverterWorkbench
            initialFormat={format}
            initialText={text}
            initialOptions={options}
            initialResult={initialResult}
        />
    );
}
