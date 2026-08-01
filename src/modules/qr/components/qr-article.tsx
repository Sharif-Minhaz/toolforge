import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import {
    EDIT_TOKEN_LENGTH,
    LOGO_SCALE_RANGE,
    MAX_PAYLOAD_LENGTH,
    MARGIN_RANGE,
    SLUG_LENGTH,
} from "../domain/constants";
import { QR_MAX_VERSION } from "../domain/qr-tables";
import { MIN_SCAN_CONTRAST } from "../domain/options";
import {
    QR_ERROR_LEVELS,
    QR_ERROR_LEVEL_RECOVERY,
    QR_PAYLOAD_KINDS,
    type QrErrorLevel,
} from "../types";

export const QR_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "types", titleKey: "types.title" },
    { id: "error-correction", titleKey: "errorCorrection.title" },
    { id: "design", titleKey: "design.title" },
    { id: "dynamic", titleKey: "dynamic.title" },
    { id: "reading", titleKey: "reading.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getQrFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("qr.article");

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

const OPTION_ROWS = [
    "kind",
    "foreground",
    "background",
    "transparent",
    "dotStyle",
    "eyeStyle",
    "errorLevel",
    "margin",
    "logo",
    "logoScale",
    "pixelSize",
] as const;

/** `30%`, rendered from the recovery table rather than typed into the copy. */
function recoveryPercent(level: QrErrorLevel): string {
    return `${Math.round(QR_ERROR_LEVEL_RECOVERY[level] * 100)}%`;
}

export async function QrArticle() {
    const [t, tKinds, tLevels, tOptions, tToc, faqs] = await Promise.all([
        getTranslations("qr.article"),
        getTranslations("qr.kinds"),
        getTranslations("qr.errorLevels"),
        getTranslations("qr.article.design.rows"),
        getTranslations("qr.toc"),
        getQrFaqEntries(),
    ]);

    const tocItems: TocItem[] = QR_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="min-w-0 xl:order-2">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t("understanding.p1")}</p>
                        <p>{t("understanding.p2", { versions: QR_MAX_VERSION })}</p>
                        <p>{t("understanding.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="types" title={t("types.title")}>
                    <div className={PROSE}>
                        <p>{t("types.p1")}</p>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-140 border-collapse text-left text-[0.8125rem]">
                            <thead>
                                <tr className="border-border/70 text-muted-foreground border-b">
                                    <th scope="col" className="py-2 pr-4 font-medium">
                                        {t("types.columnKind")}
                                    </th>
                                    <th scope="col" className="py-2 pr-4 font-medium">
                                        {t("types.columnPayload")}
                                    </th>
                                    <th scope="col" className="py-2 font-medium">
                                        {t("types.columnBehaviour")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="text-muted-foreground">
                                {QR_PAYLOAD_KINDS.map((kind) => (
                                    <tr key={kind} className="border-border/40 border-b">
                                        <th
                                            scope="row"
                                            className="text-foreground py-2.5 pr-4 font-medium whitespace-nowrap"
                                        >
                                            {tKinds(kind)}
                                        </th>
                                        <td className="py-2.5 pr-4 font-mono text-[0.75rem] whitespace-nowrap">
                                            {t(`types.rows.${kind}.payload`)}
                                        </td>
                                        <td className="py-2.5 leading-relaxed">
                                            {t(`types.rows.${kind}.behaviour`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`${PROSE} mt-4`}>
                        <p>{t("types.p2", { limit: MAX_PAYLOAD_LENGTH })}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="error-correction" title={t("errorCorrection.title")}>
                    <div className={PROSE}>
                        <p>{t("errorCorrection.p1")}</p>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-120 border-collapse text-left text-[0.8125rem]">
                            <thead>
                                <tr className="border-border/70 text-muted-foreground border-b">
                                    <th scope="col" className="py-2 pr-4 font-medium">
                                        {t("errorCorrection.columnLevel")}
                                    </th>
                                    <th scope="col" className="py-2 pr-4 font-medium">
                                        {t("errorCorrection.columnRecovery")}
                                    </th>
                                    <th scope="col" className="py-2 font-medium">
                                        {t("errorCorrection.columnUse")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="text-muted-foreground">
                                {QR_ERROR_LEVELS.map((level) => (
                                    <tr key={level} className="border-border/40 border-b">
                                        <th
                                            scope="row"
                                            className="text-foreground py-2.5 pr-4 font-medium whitespace-nowrap"
                                        >
                                            {tLevels(level)}
                                        </th>
                                        <td className="py-2.5 pr-4 font-mono text-[0.75rem]">
                                            {recoveryPercent(level)}
                                        </td>
                                        <td className="py-2.5 leading-relaxed">
                                            {t(`errorCorrection.rows.${level}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`${PROSE} mt-4`}>
                        <p>{t("errorCorrection.p2")}</p>
                        <p>{t("errorCorrection.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="design" title={t("design.title")}>
                    <div className={PROSE}>
                        <p>{t("design.p1")}</p>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-160 border-collapse text-left text-[0.8125rem]">
                            <thead>
                                <tr className="border-border/70 text-muted-foreground border-b">
                                    <th scope="col" className="py-2 pr-4 font-medium">
                                        {t("design.columnOption")}
                                    </th>
                                    <th scope="col" className="py-2 pr-4 font-medium">
                                        {t("design.columnEffect")}
                                    </th>
                                    <th scope="col" className="py-2 font-medium">
                                        {t("design.columnWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="text-muted-foreground">
                                {OPTION_ROWS.map((row) => (
                                    <tr key={row} className="border-border/40 border-b">
                                        <th
                                            scope="row"
                                            className="text-foreground py-2.5 pr-4 font-medium whitespace-nowrap"
                                        >
                                            {tOptions(`${row}.name`)}
                                        </th>
                                        <td className="py-2.5 pr-4 leading-relaxed">
                                            {tOptions(`${row}.effect`)}
                                        </td>
                                        <td className="py-2.5 leading-relaxed">
                                            {tOptions(`${row}.when`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`${PROSE} mt-4`}>
                        <p>{t("design.p2", { ratio: MIN_SCAN_CONTRAST })}</p>
                        <p>
                            {t("design.p3", {
                                min: Math.round(LOGO_SCALE_RANGE.min * 100),
                                max: Math.round(LOGO_SCALE_RANGE.max * 100),
                            })}
                        </p>
                        <p>{t("design.p4", { min: MARGIN_RANGE.min, max: MARGIN_RANGE.max })}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="dynamic" title={t("dynamic.title")}>
                    <div className={PROSE}>
                        <p>{t("dynamic.p1")}</p>
                        <p>{t("dynamic.p2", { length: SLUG_LENGTH })}</p>
                        <p>{t("dynamic.p3", { length: EDIT_TOKEN_LENGTH })}</p>
                        <p>{t("dynamic.p4")}</p>
                        <p>{t("dynamic.p5")}</p>
                    </div>

                    <ul className={`${PROSE_TEXT} mt-4 flex list-disc flex-col gap-2 pl-5`}>
                        <li>{t("dynamic.point1")}</li>
                        <li>{t("dynamic.point2")}</li>
                        <li>{t("dynamic.point3")}</li>
                    </ul>
                </ArticleSection>

                <ArticleSection id="reading" title={t("reading.title")}>
                    <div className={PROSE}>
                        <p>{t("reading.p1")}</p>
                        <p>{t("reading.p2")}</p>
                        <p>{t("reading.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.p1")}</p>
                        <p>{t("privacy.p2")}</p>
                        <p>{t("privacy.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
