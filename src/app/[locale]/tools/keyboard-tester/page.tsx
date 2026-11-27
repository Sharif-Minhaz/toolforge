import { IconChevronRight, IconLanguage, IconStethoscope, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getKeyboardTesterFaqEntries,
    KeyboardTesterArticle,
} from "@/modules/keyboard-tester/components/keyboard-tester-article";
import { KeyboardTesterModes } from "@/modules/keyboard-tester/components/keyboard-tester-modes";
import { KeyboardTesterWorkbenchSkeleton } from "@/modules/keyboard-tester/components/keyboard-tester-workbench-skeleton";
import {
    DEFAULT_KEY_FAULT_WINDOW_MS,
    DEFAULT_KEY_LABEL_SYSTEM,
    DEFAULT_KEYBOARD_SIZE,
    DEFAULT_KEYBOARD_STANDARD,
    DEFAULT_TYPING_DURATION,
    DEFAULT_TYPING_LANGUAGE,
} from "@/modules/keyboard-tester/domain/constants";
import { drawTypingWords, wordsForDuration } from "@/modules/keyboard-tester/domain/typing";
import { keyboardTesterSearchParamsSchema } from "@/modules/keyboard-tester/validation/search-params";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/keyboard-tester";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("keyboardTester.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("keyboard-tester")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type KeyboardTesterPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function KeyboardTesterPage({
    params,
    searchParams,
}: KeyboardTesterPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("keyboardTester.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getKeyboardTesterFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLayouts"), Icon: IconLanguage },
        { label: t("badgeChatter"), Icon: IconStethoscope },
        { label: t("badgeLocal"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("keyboard-tester.name"),
                    description: tTools("keyboard-tester.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("keyboard-tester")?.keywords,
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
                    <Suspense fallback={<KeyboardTesterWorkbenchSkeleton />}>
                        <KeyboardTesterWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <KeyboardTesterArticle />
                </Reveal>

                <RelatedTools toolId="keyboard-tester" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the mode, layout, label system,
 * fault window and typing settings a shared link names, and draws the typing
 * test's first text. Everything around it is prerendered.
 */
async function KeyboardTesterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = keyboardTesterSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : undefined;

    const language = shared?.lang ?? DEFAULT_TYPING_LANGUAGE;
    const duration = shared?.time ?? DEFAULT_TYPING_DURATION;

    return (
        <KeyboardTesterModes
            initialMode={shared?.mode ?? "keys"}
            keys={{
                initialSize: shared?.size ?? DEFAULT_KEYBOARD_SIZE,
                initialStandard: shared?.standard ?? DEFAULT_KEYBOARD_STANDARD,
                initialSystem: shared?.os ?? DEFAULT_KEY_LABEL_SYSTEM,
                initialFaultWindow: shared?.window ?? DEFAULT_KEY_FAULT_WINDOW_MS,
            }}
            typing={{
                // Drawn here, after the request data, and passed down: a draw in
                // the island would differ between the server pass and hydration.
                initialWords: drawTypingWords(
                    language,
                    wordsForDuration(duration),
                    cryptoRandomBytes,
                ),
                initialLanguage: language,
                initialDuration: duration,
            }}
        />
    );
}
