"use client";

import { IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ByteSize } from "@/modules/tools/components/byte-size";

import { getSpeechVoice } from "../domain/voices";
import type { SpeechAudio } from "./use-speech-generation";
import { useClock } from "./use-clock";

type SpeechResultProps = {
    readonly audio: SpeechAudio;
    readonly onDownload: () => void;
};

/** The finished file: a player, what it is, and the button that saves it. */
export function SpeechResult({ audio, onDownload }: SpeechResultProps) {
    const t = useTranslations("textToSpeech.result");
    const tWorkbench = useTranslations("textToSpeech.workbench");
    const clock = useClock();
    const voice = getSpeechVoice(audio.voice);

    return (
        <section
            aria-label={t("label")}
            className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-3 rounded-2xl p-4 ring-1 ring-inset"
        >
            {/* Native controls: keyboard, screen readers, speed and the
                platform's own media keys all work without a line of code. */}
            <audio
                controls
                src={audio.url}
                preload="metadata"
                className="w-full"
                aria-label={t("player")}
            >
                {t("unsupported")}
            </audio>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground min-w-0 text-[0.8125rem] leading-[1.4]">
                    {t("summary", {
                        voice: `${voice.name} (${tWorkbench(`gender.${voice.gender}`)})`,
                        duration: clock(audio.seconds),
                    })}{" "}
                    · <ByteSize bytes={audio.blob.size} />
                </p>

                <Button onClick={onDownload} className="h-9 px-3.5">
                    <IconDownload className="size-4" stroke={1.9} aria-hidden="true" />
                    {t("download")}
                </Button>
            </div>
        </section>
    );
}
