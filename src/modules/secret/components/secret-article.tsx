import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { DEFAULT_SECRET_BYTES } from "../domain/constants";
import { countCharacters } from "../domain/encodings";
import { entropyBits } from "../domain/generate";
import { BASE64URL_SWAP_STAGE, equivalentCommand } from "../domain/openssl";

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getSecretFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("secret.article");

    return [
        {
            question: t("faq.q1"),
            // The swap stage arrives as an argument for the same reason the
            // opening example's command does: an apostrophe inside a message
            // escapes what follows it, and this answer has markup after it.
            answer: t.markup("faq.a1", { ...PLAIN_TAGS, swap: BASE64URL_SWAP_STAGE }),
            answerNode: t.rich("faq.a1", { ...ARTICLE_TAGS, swap: BASE64URL_SWAP_STAGE }),
        },
        { question: t("faq.q2"), answer: t("faq.a2") },
        {
            question: t("faq.q3"),
            answer: t.markup("faq.a3", PLAIN_TAGS),
            answerNode: t.rich("faq.a3", ARTICLE_TAGS),
        },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
    ];
}

/**
 * The default byte count, so the opening example's numbers match the value on
 * screen rather than an abstraction.
 */
const SAMPLE_BYTES = DEFAULT_SECRET_BYTES;

export async function SecretArticle() {
    const [t, faqs] = await Promise.all([getTranslations("secret.article"), getSecretFaqEntries()]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="understanding" title={t("understanding.title")}>
                <div className={PROSE}>
                    <p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
                    <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                    <ArticleExample>
                        {t.rich("understanding.example", {
                            ...ARTICLE_TAGS,
                            // Passed as an argument rather than written into
                            // the message: an argument's value is never
                            // re-parsed, so the apostrophes in the command
                            // cannot escape the markup around it.
                            command: equivalentCommand(SAMPLE_BYTES, "base64url", false),
                            characters: countCharacters(SAMPLE_BYTES, "base64url", false),
                            bits: entropyBits(SAMPLE_BYTES),
                        })}
                    </ArticleExample>
                    <p>{t.rich("understanding.p3", ARTICLE_TAGS)}</p>
                    <p>{t.rich("understanding.p4", ARTICLE_TAGS)}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
