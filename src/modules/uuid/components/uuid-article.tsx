import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { ArticleToc, type TocItem } from "./article-toc";

export const UUID_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "why", titleKey: "why.title" },
    { id: "types", titleKey: "types.title" },
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

// Capped at a comfortable measure; the comparison table breaks out of it.
const PROSE_TEXT = "text-muted-foreground max-w-[68ch] text-[0.9375rem] leading-7";
const PROSE = `flex flex-col gap-4 ${PROSE_TEXT}`;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-24">
            <h2 className="max-w-[68ch] text-xl font-semibold tracking-tight sm:text-[1.375rem]">
                {title}
            </h2>
            <div className="mt-4">{children}</div>
        </section>
    );
}

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getUuidFaqEntries() {
    const t = await getTranslations("uuid.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
    ];
}

export async function UuidArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("uuid.article"),
        getTranslations("uuid.toc"),
        getUuidFaqEntries(),
    ]);

    const tocItems: TocItem[] = UUID_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    const versionRows = [
        {
            version: "v1",
            basis: t("types.v1Basis"),
            sortable: t("types.v1Sortable"),
            bestFor: t("types.v1BestFor"),
        },
        {
            version: "v4",
            basis: t("types.v4Basis"),
            sortable: t("types.v4Sortable"),
            bestFor: t("types.v4BestFor"),
        },
        {
            version: "v7",
            basis: t("types.v7Basis"),
            sortable: t("types.v7Sortable"),
            bestFor: t("types.v7BestFor"),
        },
    ];

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="min-w-0 xl:order-2">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <Section id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t("understanding.p1")}</p>
                        <p>{t("understanding.p2")}</p>
                        <p>{t("understanding.p3")}</p>
                    </div>
                </Section>

                <Section id="why" title={t("why.title")}>
                    <div className={PROSE}>
                        <p>{t("why.p1")}</p>
                        <p>{t("why.p2")}</p>
                        <p>{t("why.p3")}</p>
                    </div>
                </Section>

                <Section id="types" title={t("types.title")}>
                    <div className={PROSE}>
                        <p>{t("types.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("types.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("types.colVersion")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("types.colBasis")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("types.colSortable")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("types.colBestFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {versionRows.map((row) => (
                                    <tr key={row.version} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium"
                                        >
                                            {row.version}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.basis}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.sortable}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.bestFor}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("types.others")}</p>
                </Section>

                <Section id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t("howItWorks.p1")}</p>
                        <p>{t("howItWorks.p2")}</p>
                        <p>{t("howItWorks.p3")}</p>
                    </div>
                </Section>

                <Section id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
                        <p>{t("useCases.p3")}</p>
                    </div>
                </Section>

                <Section id="faq" title={t("faq.title")}>
                    <dl className="flex max-w-[68ch] flex-col gap-5">
                        {faqs.map((faq) => (
                            <div
                                key={faq.question}
                                className="bg-card/60 ring-border/70 rounded-xl p-4 ring-1 ring-inset"
                            >
                                <dt className="text-[0.9375rem] font-medium">{faq.question}</dt>
                                <dd className="text-muted-foreground mt-2 text-[0.9375rem] leading-7">
                                    {faq.answer}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </Section>
            </article>
        </div>
    );
}
