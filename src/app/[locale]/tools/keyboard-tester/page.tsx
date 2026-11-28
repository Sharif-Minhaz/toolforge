import { IconLanguage, IconStethoscope, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
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
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

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
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("keyboardTester.hero"),
        getTranslations("tools"),
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
                <ToolPageHeader
                    toolId="keyboard-tester"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

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
