"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo } from "react";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { getSpeechVoice, isSpeechLocale, voicesForLocale } from "../domain/voices";
import type { VoiceLanguageGroup } from "../presenters/voice-options";
import type { SpeechLocale, SpeechVoice, SpeechVoiceId } from "../types";

type VoicePickerProps = {
    readonly groups: readonly VoiceLanguageGroup[];
    readonly voice: SpeechVoiceId;
    readonly disabled: boolean;
    readonly onLocaleChange: (locale: SpeechLocale) => void;
    readonly onVoiceChange: (voice: SpeechVoiceId) => void;
};

/**
 * Two pickers, because 322 voices in one list is a list nobody can use: first
 * the locale, grouped by language, then the handful of voices it has.
 */
export function VoicePicker({
    groups,
    voice,
    disabled,
    onLocaleChange,
    onVoiceChange,
}: VoicePickerProps) {
    const t = useTranslations("textToSpeech.workbench");
    const localeLabelId = useId();
    const voiceLabelId = useId();
    const locale = getSpeechVoice(voice).locale;

    const localeItems = useMemo(() => {
        const items: Record<string, string> = {};

        for (const group of groups) {
            for (const option of group.locales) {
                items[option.locale] = option.label;
            }
        }

        return items;
    }, [groups]);

    const voices = voicesForLocale(locale);
    const voiceLabel = (candidate: SpeechVoice) =>
        `${candidate.name} (${t(`gender.${candidate.gender}`)})`;
    const voiceItems = Object.fromEntries(
        voices.map((candidate) => [candidate.id, voiceLabel(candidate)]),
    );

    return (
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
                <Label id={localeLabelId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t("language")}</span>
                </Label>
                <Select
                    items={localeItems}
                    value={locale}
                    disabled={disabled}
                    onValueChange={(next) => {
                        if (typeof next === "string" && isSpeechLocale(next)) {
                            onLocaleChange(next);
                        }
                    }}
                >
                    <SelectTrigger
                        aria-labelledby={localeLabelId}
                        className="h-10 w-full rounded-full px-4"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                        {groups.map((group) => (
                            <SelectGroup key={group.language}>
                                <SelectLabel className="text-foreground font-semibold">
                                    {group.label}
                                </SelectLabel>
                                {group.locales.map((option) => (
                                    <SelectItem
                                        key={option.locale}
                                        value={option.locale}
                                        className="ps-5"
                                    >
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
                <Label id={voiceLabelId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t("voice")}</span>
                </Label>
                <Select
                    items={voiceItems}
                    value={voice}
                    disabled={disabled}
                    onValueChange={(next) => {
                        const match = voices.find((candidate) => candidate.id === next);

                        if (match !== undefined) {
                            onVoiceChange(match.id);
                        }
                    }}
                >
                    <SelectTrigger
                        aria-labelledby={voiceLabelId}
                        className="h-10 w-full rounded-full px-4"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                        {voices.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                                <span className="flex min-w-0 items-center gap-2.5">
                                    <VoiceBadge voice={candidate} />
                                    <span className="truncate">{voiceLabel(candidate)}</span>
                                    {"multilingual" in candidate && (
                                        <span className="text-muted-foreground text-[0.6875rem]">
                                            {t("multilingual")}
                                        </span>
                                    )}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

/**
 * The voice's initial in a disc, so a long list scans by shape as well as by
 * word. Decorative — the name beside it says everything the disc does — so it
 * is hidden from assistive technology and carries no meaning in its colour.
 */
function VoiceBadge({ voice }: { readonly voice: SpeechVoice }) {
    return (
        <span
            aria-hidden="true"
            className="bg-muted text-foreground ring-border/70 flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold ring-1 ring-inset"
        >
            {voice.name.slice(0, 1)}
        </span>
    );
}
