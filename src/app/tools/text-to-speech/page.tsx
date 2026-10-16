import {
    IconFileText,
    IconLanguage,
    IconChevronRight,
    IconDownload,
    IconPlayerPause,
    IconShieldLock,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import {
    getTextToSpeechFaqEntries,
    TextToSpeechArticle,
} from "@/modules/text-to-speech/components/text-to-speech-article";
import { TextToSpeechWorkbench } from "@/modules/text-to-speech/components/text-to-speech-workbench";
import { defaultVoiceFor } from "@/modules/text-to-speech/domain/voices";
import { buildVoiceLanguageGroups } from "@/modules/text-to-speech/presenters/voice-options";
import { isSpeechConfigured } from "@/modules/text-to-speech/repository/speech-quota";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/text-to-speech";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("textToSpeech.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("text-to-speech")?.keywords,
    });
}

export default async function TextToSpeechToolPage() {
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("textToSpeech.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getTextToSpeechFaqEntries(),
        getLocale(),
    ]);

    // Read on the server and handed down, so the island never reaches for
    // `process.env`, and an unconfigured deployment says so instead of
    // rendering a Generate button that can never work.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;
    const configured = isSpeechConfigured() && Boolean(process.env.TURNSTILE_SECRET);

    const badges = [
        { label: t("badgeVoices"), Icon: IconLanguage },
        { label: t("badgePauses"), Icon: IconPlayerPause },
        { label: t("badgeFiles"), Icon: IconFileText },
        { label: t("badgeMp3"), Icon: IconDownload },
        { label: t("badgeChallenge"), Icon: IconShieldLock },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("text-to-speech.name"),
                    description: tTools("text-to-speech.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("text-to-speech")?.keywords,
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
                    <TextToSpeechWorkbench
                        siteKey={siteKey}
                        configured={configured}
                        groups={buildVoiceLanguageGroups(locale)}
                        initialVoice={defaultVoiceFor(locale)}
                    />
                </FadeIn>

                <Reveal>
                    <TextToSpeechArticle />
                </Reveal>

                <RelatedTools toolId="text-to-speech" />
            </div>
        </>
    );
}
