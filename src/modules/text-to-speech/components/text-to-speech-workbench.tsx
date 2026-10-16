"use client";

import {
    IconFileText,
    IconLoader2,
    IconPlayerStop,
    IconPlayerPause,
    IconTextSize,
    IconWand,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    InputLimitMeter,
    useInputLimit,
    useInputLimitStatus,
} from "@/modules/tools/components/input-limit-meter";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { buildTimestampedFilename } from "@/modules/tools/domain/filenames";
import { clampToLimit, measureCharacters } from "@/modules/tools/domain/input-limit";

import {
    DEFAULT_SPEECH_SETTINGS,
    MAX_EXTRACTED_CHARACTERS,
    MAX_PAUSES,
    MAX_SPEECH_CHARACTERS,
    PAUSE_PRESETS,
    TURNSTILE_ACTION,
} from "../domain/constants";
import { planSpeech } from "../domain/plan";
import { insertPauseMarker } from "../domain/script";
import { getSpeechVoice, voiceAfterLocaleChange } from "../domain/voices";
import type { VoiceLanguageGroup } from "../presenters/voice-options";
import type {
    ExtractionResult,
    ScriptFailure,
    SourceFormat,
    SpeechMode,
    SpeechSettings,
    SpeechVoiceId,
} from "../types";
import { SpeechFilePanel } from "./speech-file-panel";
import { SpeechResult } from "./speech-result";
import { useClock } from "./use-clock";
import { useSpeechGeneration, type GenerationFailure } from "./use-speech-generation";
import { useStoredSettings } from "./use-stored-settings";
import { VoicePicker } from "./voice-picker";
import { VoiceSettingsDialog } from "./voice-settings-dialog";

type TextToSpeechWorkbenchProps = {
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent. */
    readonly siteKey: string | null;
    /** Whether this deployment can meter the route at all — database, salt and Turnstile secret. */
    readonly configured: boolean;
    /** Built and labelled on the server, so both render passes read the same strings. */
    readonly groups: readonly VoiceLanguageGroup[];
    readonly initialVoice: SpeechVoiceId;
};

type Notice = { readonly format: SourceFormat; readonly truncated: boolean };

function sameSettings(a: SpeechSettings, b: SpeechSettings): boolean {
    return a.rate === b.rate && a.volume === b.volume && a.pitch === b.pitch;
}

/**
 * The card both tabs live in, and the one place the text, the voice and the
 * settings are held — the file tab only ever hands text back to the box.
 */
export function TextToSpeechWorkbench({
    siteKey,
    configured,
    groups,
    initialVoice,
}: TextToSpeechWorkbenchProps) {
    const t = useTranslations("textToSpeech.workbench");
    const tScript = useTranslations("textToSpeech.scriptErrors");
    const tErrors = useTranslations("textToSpeech.errors");
    const formatter = useFormatter();
    const clock = useClock();
    const textId = useId();
    const statusId = useId();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [mode, setMode] = useState<SpeechMode>("text");
    const [text, setText] = useState("");
    const [voice, setVoice] = useState<SpeechVoiceId>(initialVoice);
    const [draft, setDraft] = useState<SpeechSettings | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);

    const { stored, keep, forget } = useStoredSettings();
    const generation = useSpeechGeneration();
    const { ref: resultRef, scrollToResult } = useResultScroll();

    const settings = draft ?? stored ?? DEFAULT_SPEECH_SETTINGS;
    const reading = useInputLimit(measureCharacters(text), MAX_SPEECH_CHARACTERS);
    const limitStatus = useInputLimitStatus(reading);

    // Not debounced, deliberately. Planning five thousand characters is one
    // grapheme walk — well under a frame — and its verdict is what enables
    // Generate, which has to agree with the box exactly, not 300 ms ago. A
    // longer paste is refused on its length before any walk at all.
    const plan = planSpeech(text);

    const { state, audio } = generation;
    const working = state.phase === "working";
    const available = configured && siteKey !== null;
    const canGenerate = available && token !== null && plan.ok && !working;
    const stale =
        audio !== null &&
        (audio.text !== text || audio.voice !== voice || !sameSettings(audio.settings, settings));

    function describeScript(failure: ScriptFailure): string {
        switch (failure.reason) {
            case "too_long":
                return tScript("too_long", { limit: formatter.number(MAX_SPEECH_CHARACTERS) });
            case "too_many_pauses":
                return tScript("too_many_pauses", { max: formatter.number(MAX_PAUSES) });
            case "pause_out_of_range":
                return tScript("pause_out_of_range", {
                    position: formatter.number(failure.position ?? 1),
                });
            case "empty":
                return tScript("empty");
        }
    }

    function describeFailure(failure: GenerationFailure): string {
        switch (failure.reason) {
            case "rate_limited":
                return tErrors("rate_limited", {
                    minutes: Math.max(1, Math.ceil((failure.retryAfterSeconds ?? 60) / 60)),
                });
            case "empty":
            case "too_long":
            case "too_many_pauses":
            case "pause_out_of_range":
                return describeScript({ ok: false, reason: failure.reason });
            default:
                return tErrors(failure.reason);
        }
    }

    function describeNotice(current: Notice): string {
        if (current.truncated) {
            return t("noticeTruncated", {
                limit: formatter.number(MAX_EXTRACTED_CHARACTERS),
                max: formatter.number(MAX_SPEECH_CHARACTERS),
            });
        }

        return current.format === "pdf"
            ? t("noticePdf")
            : t("noticeExtracted", { format: `.${current.format}` });
    }

    // A complaint about the text, under the text.
    const inputStatus = ((): { tone: StatusTone; message: string } => {
        if (limitStatus !== null) {
            return limitStatus;
        }

        if (!plan.ok && plan.reason !== "empty") {
            return { tone: "error", message: describeScript(plan) };
        }

        if (notice !== null) {
            return {
                tone: notice.format === "pdf" || notice.truncated ? "warning" : "idle",
                message: describeNotice(notice),
            };
        }

        if (!plan.ok) {
            return { tone: "idle", message: t("emptyHint") };
        }

        return {
            tone: "idle",
            message: t("ready", {
                characters: plan.spokenCharacters,
                pauses: plan.steps.filter((step) => step.kind === "pause").length,
            }),
        };
    })();

    /** A Turnstile token is single-use, so every attempt draws a fresh one. */
    function renewChallenge() {
        setToken(null);
        setResetSignal((current) => current + 1);
    }

    function updateSettings(next: SpeechSettings) {
        setDraft(next);

        if (stored !== null) {
            keep(next);
        }
    }

    function changeKept(next: boolean) {
        // The values on screen stay put either way: turning keeping off
        // forgets them in storage, not in the sliders.
        setDraft(settings);

        if (next) {
            keep(settings);
        } else {
            forget();
        }
    }

    function insertPause(seconds: number) {
        const box = textareaRef.current;
        const inserted = insertPauseMarker(
            text,
            box?.selectionStart ?? text.length,
            box?.selectionEnd ?? text.length,
            seconds,
        );

        setText(inserted.text);
        // After React has written the new value, put the caret just past the
        // marker so typing carries on where the reader was.
        window.requestAnimationFrame(() => box?.setSelectionRange(inserted.caret, inserted.caret));
    }

    function clearText() {
        setText("");
        setNotice(null);
        textareaRef.current?.focus();
    }

    function handleExtracted(result: Extract<ExtractionResult, { ok: true }>) {
        setText(result.text);
        setNotice({ format: result.format, truncated: result.truncated });
        setMode("text");
    }

    async function handleGenerate() {
        if (!canGenerate || token === null) {
            return;
        }

        const spent = token;

        renewChallenge();

        if (await generation.generate({ text, voice, settings }, spent)) {
            scrollToResult();
        }
    }

    function handleDownload() {
        if (audio === null) {
            return;
        }

        const stem = `speech-${getSpeechVoice(audio.voice).name.toLowerCase()}`;

        saveBlob({ blob: audio.blob, filename: buildTimestampedFilename(stem, new Date(), "mp3") });
    }

    // A complaint about the operation, where the audio would have been.
    const operationStatus = ((): { tone: StatusTone; message: string } | null => {
        if (!available) {
            return { tone: "warning", message: t("unavailable") };
        }

        if (state.phase === "failed") {
            return { tone: "error", message: describeFailure(state.failure) };
        }

        if (working) {
            return null;
        }

        if (token === null) {
            return challengeFailed
                ? { tone: "error", message: t("challengeFailed") }
                : { tone: "pending", message: t("challengePending") };
        }

        return stale ? { tone: "warning", message: t("resultStale") } : null;
    })();

    const percent =
        state.phase === "working" && state.steps > 0
            ? Math.round((state.step / state.steps) * 100)
            : 0;

    return (
        <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardContent className="flex min-w-0 flex-col gap-5">
                <Tabs
                    value={mode}
                    onValueChange={(next) => setMode(next === "file" ? "file" : "text")}
                    className="min-w-0"
                >
                    <TabsList className="w-full">
                        <TabsTrigger value="text">
                            <IconTextSize stroke={1.8} aria-hidden="true" />
                            {t("tabText")}
                        </TabsTrigger>
                        <TabsTrigger value="file">
                            <IconFileText stroke={1.8} aria-hidden="true" />
                            {t("tabFile")}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent
                        value="text"
                        className="flex min-w-0 flex-col gap-4 pt-4"
                        keepMounted
                    >
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <span className="ring-border/80 inline-flex h-8 items-center rounded-full px-3 ring-1 ring-inset">
                                <InputLimitMeter
                                    reading={reading}
                                    always
                                    className="text-xs font-medium"
                                />
                            </span>

                            <div className="flex items-center gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        render={
                                            <Button
                                                variant="outline"
                                                disabled={working}
                                                className="h-8 rounded-full px-3 text-[0.8125rem]"
                                            />
                                        }
                                    >
                                        <IconPlayerPause
                                            className="size-4"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                        {t("pauses")}
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        className="w-40"
                                        align="end"
                                        finalFocus={textareaRef}
                                    >
                                        {/* A label must sit inside a group: Base UI throws without one,
                                            which takes the whole page down with it. */}
                                        <DropdownMenuGroup>
                                            <DropdownMenuLabel>
                                                {t("pausesLabel")}
                                            </DropdownMenuLabel>
                                            {PAUSE_PRESETS.map((seconds) => (
                                                <DropdownMenuItem
                                                    key={seconds}
                                                    onClick={() => insertPause(seconds)}
                                                >
                                                    {t("pauseItem", {
                                                        seconds: formatter.number(seconds),
                                                    })}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <Button
                                    variant="outline"
                                    onClick={clearText}
                                    disabled={text.length === 0 || working}
                                    className="h-8 rounded-full px-3 text-[0.8125rem]"
                                >
                                    {t("clear")}
                                </Button>
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-col gap-2">
                            <label htmlFor={textId} className="sr-only">
                                {t("textLabel")}
                            </label>
                            <Textarea
                                id={textId}
                                ref={textareaRef}
                                value={text}
                                onChange={(event) => setText(event.target.value)}
                                placeholder={t("textPlaceholder")}
                                aria-describedby={statusId}
                                aria-invalid={
                                    reading.state === "over" ||
                                    (!plan.ok && plan.reason !== "empty")
                                }
                                disabled={working}
                                spellCheck
                                className="field-sizing-fixed h-64 min-h-40 resize-y rounded-2xl px-4 py-3.5 text-[0.9375rem] leading-[1.7] sm:h-80"
                            />

                            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                <StatusStrip
                                    id={statusId}
                                    tone={inputStatus.tone}
                                    message={inputStatus.message}
                                />
                                {reading.state === "over" && (
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            setText(clampToLimit(text, MAX_SPEECH_CHARACTERS))
                                        }
                                        className="h-7 px-2.5 text-xs"
                                    >
                                        {t("keepFirst", {
                                            limit: formatter.number(MAX_SPEECH_CHARACTERS),
                                        })}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="flex min-w-0 items-end gap-3">
                            <VoicePicker
                                groups={groups}
                                voice={voice}
                                disabled={working}
                                onLocaleChange={(locale) =>
                                    setVoice(voiceAfterLocaleChange(voice, locale))
                                }
                                onVoiceChange={setVoice}
                            />
                            <VoiceSettingsDialog
                                settings={settings}
                                kept={stored !== null}
                                disabled={working}
                                onChange={updateSettings}
                                onKeptChange={changeKept}
                            />
                        </div>

                        {siteKey !== null && configured && (
                            // Reserves the widget's height so the button below
                            // does not jump once Cloudflare's script loads.
                            <div className="min-h-16 w-full max-w-82 min-w-0">
                                <TurnstileWidget
                                    siteKey={siteKey}
                                    action={TURNSTILE_ACTION}
                                    resetSignal={resetSignal}
                                    onVerify={(next) => {
                                        setToken(next);
                                        setChallengeFailed(false);
                                    }}
                                    onExpire={renewChallenge}
                                    onError={() => {
                                        setToken(null);
                                        setChallengeFailed(true);
                                    }}
                                />
                            </div>
                        )}

                        <Button
                            onClick={() => void handleGenerate()}
                            disabled={!canGenerate}
                            className="h-12 w-full rounded-full text-[0.9375rem]"
                        >
                            {working ? (
                                <IconLoader2 className="size-4.5 animate-spin" aria-hidden="true" />
                            ) : (
                                <IconWand className="size-4.5" stroke={1.8} aria-hidden="true" />
                            )}
                            {working ? t("generating") : t("generate")}
                        </Button>

                        {state.phase === "working" && (
                            <div className="flex min-w-0 flex-col gap-2">
                                <div className="flex min-w-0 items-center justify-between gap-3">
                                    <p
                                        role="status"
                                        className="text-muted-foreground text-[0.8125rem] leading-[1.4]"
                                    >
                                        {state.steps === 0
                                            ? t("connecting")
                                            : t("progress", {
                                                  step: formatter.number(
                                                      Math.min(state.step + 1, state.steps),
                                                  ),
                                                  steps: formatter.number(state.steps),
                                                  duration: clock(state.seconds),
                                              })}
                                    </p>
                                    <Button
                                        variant="outline"
                                        onClick={generation.cancel}
                                        className="h-8 shrink-0 px-3 text-[0.8125rem]"
                                    >
                                        <IconPlayerStop
                                            className="size-4"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                        {t("cancel")}
                                    </Button>
                                </div>
                                {/* A real progressbar: a minute-long wait is exactly
                                    when somebody needs to know how far in they are. */}
                                <div
                                    role="progressbar"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={percent}
                                    aria-label={t("progressLabel")}
                                    className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                                >
                                    <div
                                        className="bg-primary h-full rounded-full transition-[width] duration-300"
                                        style={{ width: `${Math.max(percent, 2)}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {operationStatus !== null && (
                            <StatusStrip
                                tone={operationStatus.tone}
                                message={operationStatus.message}
                            />
                        )}

                        {audio !== null && (
                            <div
                                ref={resultRef}
                                className={cn(
                                    "min-w-0 transition-opacity duration-200",
                                    stale && "opacity-55",
                                )}
                            >
                                <SpeechResult audio={audio} onDownload={handleDownload} />
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="file" className="min-w-0 pt-4" keepMounted>
                        <SpeechFilePanel disabled={working} onExtracted={handleExtracted} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
