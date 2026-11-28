import {
    IconFileText,
    IconLanguage,
    IconDownload,
    IconPlayerPause,
    IconShieldLock,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

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
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/text-to-speech";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("textToSpeech.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("text-to-speech")?.keywords,
    });
}

export default async function TextToSpeechToolPage({ params }: { params: LocaleParams }) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("textToSpeech.hero"),
        getTranslations("tools"),
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
                <ToolPageHeader
                    toolId="text-to-speech"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

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
