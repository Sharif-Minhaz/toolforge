import { IconChevronRight, IconLanguage, IconStethoscope, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getKeyboardTesterFaqEntries,
    KeyboardTesterArticle,
} from "@/modules/keyboard-tester/components/keyboard-tester-article";
import { KeyboardTesterWorkbench } from "@/modules/keyboard-tester/components/keyboard-tester-workbench";
import {
    DEFAULT_KEY_FAULT_WINDOW_MS,
    DEFAULT_KEY_LABEL_SYSTEM,
    DEFAULT_KEYBOARD_SIZE,
    DEFAULT_KEYBOARD_STANDARD,
} from "@/modules/keyboard-tester/domain/constants";
import { keyboardTesterSearchParamsSchema } from "@/modules/keyboard-tester/validation/search-params";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/keyboard-tester";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("keyboardTester.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("keyboard-tester")?.keywords,
    });
}

type KeyboardTesterPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function KeyboardTesterPage({ searchParams }: KeyboardTesterPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("keyboardTester.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getKeyboardTesterFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = keyboardTesterSearchParamsSchema.safeParse(params);
    const shared = parsed.success ? parsed.data : undefined;

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
                    <KeyboardTesterWorkbench
                        initialSize={shared?.size ?? DEFAULT_KEYBOARD_SIZE}
                        initialStandard={shared?.standard ?? DEFAULT_KEYBOARD_STANDARD}
                        initialSystem={shared?.os ?? DEFAULT_KEY_LABEL_SYSTEM}
                        initialFaultWindow={shared?.window ?? DEFAULT_KEY_FAULT_WINDOW_MS}
                    />
                </FadeIn>

                <Reveal>
                    <KeyboardTesterArticle />
                </Reveal>

                <RelatedTools toolId="keyboard-tester" />
            </div>
        </>
    );
}
