import { IconChevronRight, IconMathFunction, IconStack2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    EquationArticle,
    getEquationFaqEntries,
} from "@/modules/equation/components/equation-article";
import { EquationWorkbench } from "@/modules/equation/components/equation-workbench";
import { DEFAULT_DISPLAY_MODE } from "@/modules/equation/domain/constants";
import { convertTextToLatex } from "@/modules/equation/domain/text-to-latex";
import { isEquationRecognizerConfigured } from "@/modules/equation/repository/math-ocr";
import { equationSearchParamsSchema } from "@/modules/equation/validation/equation";
import type { ConvertedEquation } from "@/modules/equation/types";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/equation";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("equation.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("equation")?.keywords,
    });
}

type EquationPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EquationToolPage({ searchParams }: EquationPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("equation.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getEquationFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = equationSearchParamsSchema.safeParse(params);
    const shared = parsed.success ? parsed.data : undefined;
    const text = shared?.text ?? "";

    // Converted here rather than in an effect, so a shared link paints its
    // answer on the first frame and hydration has nothing to reconcile. The
    // conversion is pure, so the server and the browser cannot disagree.
    const converted = convertTextToLatex(text);
    const equations: readonly ConvertedEquation[] = converted.ok ? converted.equations : [];

    // Three sources, in the order they should win. The link is the reader's own
    // explicit choice, so it beats everything; failing that, delimiters the
    // shared text arrived wrapped in said what the author meant; failing both,
    // the default. The schema keeps `display` a string so "absent" and "0" stay
    // distinguishable — see `validation/equation.ts`.
    const display =
        shared?.display !== undefined
            ? shared.display === "1"
            : ((converted.ok ? converted.display : null) ?? DEFAULT_DISPLAY_MODE);

    // Both resolved here rather than in the island: whether a worker URL, a key
    // and a Turnstile site key exist is not something the browser can know, and
    // a control that cannot work is worse than an absent one.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;
    const recognizerConfigured = isEquationRecognizerConfigured();

    const badges = [
        { label: t("badgeKatex"), Icon: IconMathFunction },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeBulk"), Icon: IconStack2 },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("equation.name"),
                    description: tTools("equation.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("equation")?.keywords,
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
                    <EquationWorkbench
                        initialText={text}
                        initialDisplay={display}
                        initialEquations={equations}
                        siteKey={siteKey}
                        recognizerConfigured={recognizerConfigured}
                    />
                </FadeIn>

                <Reveal>
                    <EquationArticle />
                </Reveal>

                <RelatedTools toolId="equation" />
            </div>
        </>
    );
}
