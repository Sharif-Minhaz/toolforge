import { getFormatter, getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { MAX_REMOTE_IMAGE_BYTES } from "@/modules/tools/domain/remote-image";
import { describeByteSize } from "@/modules/tools/domain/byte-size";
import { DEFAULT_DPI, MAX_IMAGE_BYTES, MAX_PIXELS } from "../domain/constants";
import { presetsInGroup, presetPixels } from "../domain/presets";

export const IMAGE_RESIZER_ARTICLE_SECTIONS = [
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "cropping", titleKey: "crop.title" },
    { id: "sizing", titleKey: "sizing.title" },
    { id: "presets", titleKey: "presets.title" },
    { id: "resolution", titleKey: "dpi.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "quality", titleKey: "quality.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getImageResizerFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("imageResizer.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
    ];
}

export async function ImageResizerArticle() {
    const [t, tUnits, tToc, format, faqs] = await Promise.all([
        getTranslations("imageResizer.article"),
        getTranslations("units"),
        getTranslations("imageResizer.toc"),
        getFormatter(),
        getImageResizerFaqEntries(),
    ]);

    const tocItems: TocItem[] = IMAGE_RESIZER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Literal unions, so every message key below is checked at compile time.
    const controlRows = [
        "crop",
        "undo",
        "ratio",
        "mode",
        "unit",
        "dpi",
        "lock",
        "fit",
        "background",
        "format",
        "quality",
        "density",
        "export",
    ] as const;

    // Read from the same table the picker reads, so the article cannot drift
    // from the tool: adding a passport size adds a row here.
    const documentPresets = presetsInGroup("photo");

    function byteLabel(bytes: number): string {
        const { value, unit } = describeByteSize(bytes);

        return tUnits(unit, { value: format.number(value) });
    }

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("howItWorks.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>
                            {t.rich("howItWorks.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t.rich("howItWorks.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="cropping" title={t("crop.title")}>
                    <div className={PROSE}>
                        <p>{t("crop.body1")}</p>
                        <p>{t("crop.body2")}</p>
                        <p>{t("crop.body3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="sizing" title={t("sizing.title")}>
                    <div className={PROSE}>
                        <p>{t("sizing.body1")}</p>
                        <p>{t("sizing.body2")}</p>
                        <p>{t("sizing.body3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="presets" title={t("presets.title")}>
                    <div className={PROSE}>
                        <p>{t("presets.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-120 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("presets.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-3 py-2.5 font-medium">
                                        {t("presets.colName")}
                                    </th>
                                    <th scope="col" className="px-3 py-2.5 font-medium">
                                        {t("presets.colPhysical")}
                                    </th>
                                    <th scope="col" className="px-3 py-2.5 font-medium">
                                        {t("presets.colPixels")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {documentPresets.map((preset) => {
                                    const pixels = presetPixels(preset.size, DEFAULT_DPI);

                                    return (
                                        <tr
                                            key={preset.id}
                                            className="border-border/60 not-last:border-b"
                                        >
                                            <th
                                                scope="row"
                                                className="px-3 py-2.5 text-left font-medium"
                                            >
                                                {preset.platform}
                                            </th>
                                            <td className="text-muted-foreground px-3 py-2.5">
                                                {preset.label}
                                            </td>
                                            <td className="text-muted-foreground px-3 py-2.5 font-mono text-[0.8125rem] tabular-nums">
                                                {format.number(pixels.width)} ×{" "}
                                                {format.number(pixels.height)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className={`${PROSE} mt-5`}>
                        <p>{t("presets.outro")}</p>
                        <p>{t("presets.note")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="resolution" title={t("dpi.title")}>
                    <div className={PROSE}>
                        <p>{t("dpi.body1")}</p>
                        <p>{t("dpi.body2")}</p>
                        <p>{t("dpi.body3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="controls" title={t("controls.title")}>
                    <div className={PROSE}>
                        <p>{t("controls.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("controls.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-3 py-2.5 font-medium">
                                        {t("controls.colControl")}
                                    </th>
                                    <th scope="col" className="px-3 py-2.5 font-medium">
                                        {t("controls.colDoes")}
                                    </th>
                                    <th scope="col" className="px-3 py-2.5 font-medium">
                                        {t("controls.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {controlRows.map((row) => (
                                    <tr key={row} className="border-border/60 not-last:border-b">
                                        <th
                                            scope="row"
                                            className="px-3 py-2.5 text-left font-medium"
                                        >
                                            {t(`controls.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-3 py-2.5">
                                            {t(`controls.${row}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-3 py-2.5">
                                            {t(`controls.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ArticleSection>

                <ArticleSection id="quality" title={t("quality.title")}>
                    <div className={PROSE}>
                        <p>{t("quality.body1")}</p>
                        <p>{t("quality.body2")}</p>
                        <p>{t("quality.body3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>
                            {t("limits.body", {
                                bytes: byteLabel(MAX_IMAGE_BYTES),
                                pixels: format.number(Math.round(MAX_PIXELS / 1_000_000)),
                                remote: byteLabel(MAX_REMOTE_IMAGE_BYTES),
                            })}
                        </p>
                    </div>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.body1")}</p>
                        <p>{t("privacy.body2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
