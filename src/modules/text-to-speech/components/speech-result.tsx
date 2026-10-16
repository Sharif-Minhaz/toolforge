"use client";

import { IconDownload, IconWaveSine } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { StatusStrip } from "@/modules/tools/components/status-strip";

import { getSpeechVoice } from "../domain/voices";
import { useClock } from "./use-clock";
import type { SpeechAudio } from "./use-speech-generation";

type SpeechResultProps = {
    readonly audio: SpeechAudio;
    /** The text, voice or settings have moved on since this was made. */
    readonly stale: boolean;
    readonly onDownload: () => void;
};

/**
 * The finished file: what it is and the button that saves it, then the player.
 *
 * A changed input marks the card rather than hiding it — the file is still the
 * one that was made, and still worth playing or saving — and says so inside
 * the card, beside the thing it is about.
 */
export function SpeechResult({ audio, stale, onDownload }: SpeechResultProps) {
    const t = useTranslations("textToSpeech.result");
    const tWorkbench = useTranslations("textToSpeech.workbench");
    const clock = useClock();
    const byteLabel = useByteLabel();
    const voice = getSpeechVoice(audio.voice);

    return (
        <section
            aria-label={t("label")}
            className="bg-card ring-border/70 flex min-w-0 flex-col gap-3 rounded-2xl p-3 ring-1 ring-inset sm:p-4"
        >
            <div className="flex min-w-0 items-center gap-3">
                <span
                    aria-hidden="true"
                    className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-200",
                        stale ? "bg-muted text-muted-foreground" : "bg-primary/12 text-primary",
                    )}
                >
                    <IconWaveSine className="size-5" stroke={1.8} />
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="flex min-w-0 items-center gap-2 text-sm leading-[1.3] font-medium">
                        <span className="truncate">
                            {voice.name} ({tWorkbench(`gender.${voice.gender}`)})
                        </span>
                        {stale && (
                            <span className="text-muted-foreground ring-border shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset">
                                {t("stale")}
                            </span>
                        )}
                    </p>
                    <p className="text-muted-foreground text-xs leading-[1.4] tabular-nums">
                        {t("meta", {
                            duration: clock(audio.seconds),
                            size: byteLabel(audio.blob.size),
                        })}
                    </p>
                </div>

                <Button
                    onClick={onDownload}
                    variant={stale ? "outline" : "default"}
                    aria-label={t("download")}
                    className="h-9 shrink-0 rounded-lg px-3"
                >
                    <IconDownload className="size-4" stroke={1.9} aria-hidden="true" />
                    <span className="hidden sm:inline">{t("download")}</span>
                </Button>
            </div>

            {/* Native controls: keyboard, screen readers, speed and the
                platform's own media keys all work without a line of code. */}
            <audio
                controls
                src={audio.url}
                preload="metadata"
                className="h-10 w-full min-w-0"
                aria-label={t("player")}
            >
                {t("unsupported")}
            </audio>

            {stale && <StatusStrip tone="idle" message={tWorkbench("resultStale")} />}
        </section>
    );
}
