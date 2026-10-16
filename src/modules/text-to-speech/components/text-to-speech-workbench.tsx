"use client";

import {
    IconArrowBackUp,
    IconFileText,
    IconLanguage,
    IconLoader2,
    IconPlayerStop,
    IconPlayerPause,
    IconTextSize,
    IconWand,
} from "@tabler/icons-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";

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
import { translationTargetFor } from "../domain/translation";
import { getSpeechVoice, languageOfLocale, voiceAfterLocaleChange } from "../domain/voices";
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
import { useTextTranslation } from "./use-text-translation";
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

/** What the box held before Translate, and what the translation was — for Undo and the notice. */
type Translated = {
    readonly original: string;
    /** Google's code for the language it detected, when it said. */
    readonly source: string | null;
    /** The voice's language subtag the text was translated into. */
    readonly language: string;
};

/**
 * A language code as a name in the reader's interface language. Called only
 * after a press — never during the server render — so the browser's ICU cannot
 * make the two passes disagree.
 */
function languageName(code: string, interfaceLocale: string): string {
    try {
        return (
            new Intl.DisplayNames([interfaceLocale], { type: "language", fallback: "none" }).of(
                code === "iw" ? "he" : code === "jw" ? "jv" : code,
            ) ?? code
        );
    } catch {
        return code;
    }
}

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
    const tTranslate = useTranslations("textToSpeech.translationErrors");
    const formatter = useFormatter();
    const interfaceLocale = useLocale();
    const clock = useClock();
    const textId = useId();
    const statusId = useId();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [mode, setMode] = useState<SpeechMode>("text");
    const [text, setText] = useState("");
    const [voice, setVoice] = useState<SpeechVoiceId>(initialVoice);
    const [draft, setDraft] = useState<SpeechSettings | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [translated, setTranslated] = useState<Translated | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);

    const { stored, keep, forget } = useStoredSettings();
    const generation = useSpeechGeneration();
    const translation = useTextTranslation();
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
    const translating = translation.state.phase === "working";
    // Either job owns the box while it runs: typing into text that is being
    // translated, or spoken, would be lost the moment the answer lands.
    const working = state.phase === "working" || translating;
    const available = configured && siteKey !== null;
    const canGenerate = available && token !== null && plan.ok && !working;

    const voiceLanguage = languageOfLocale(getSpeechVoice(voice).locale);
    const languageLabels = useMemo(
        () => new Map(groups.map((group) => [group.language, group.label])),
        [groups],
    );
    const targetLabel = languageLabels.get(voiceLanguage) ?? voiceLanguage;
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

    function describeTranslated(current: Translated): string {
        const target = languageLabels.get(current.language) ?? current.language;
        const source = current.source;

        if (source === null) {
            return t("translatedInto", { target });
        }

        if (
            source.split("-")[0] ===
            translationTargetFor(getSpeechVoice(voice).locale).split("-")[0]
        ) {
            return t("alreadyIn", { target });
        }

        return t("translatedFrom", { source: languageName(source, interfaceLocale), target });
    }

    // A complaint about the text, under the text — and Translate's answer is a
    // change to the text, so its progress and its failures sit here too.
    const inputStatus = ((): { tone: StatusTone; message: string } => {
        if (limitStatus !== null) {
            return limitStatus;
        }

        if (translation.state.phase === "working") {
            return {
                tone: "pending",
                message: t("translating", {
                    done: formatter.number(translation.state.done),
                    total: formatter.number(translation.state.total),
                }),
            };
        }

        if (translation.state.phase === "failed") {
            const reason = translation.state.reason;

            return {
                tone: "error",
                message:
                    reason === "too_long"
                        ? tTranslate("too_long", { limit: formatter.number(MAX_SPEECH_CHARACTERS) })
                        : reason === "unsupported_language"
                          ? tTranslate("unsupported_language", { language: targetLabel })
                          : tTranslate(reason),
            };
        }

        if (!plan.ok && plan.reason !== "empty") {
            return { tone: "error", message: describeScript(plan) };
        }

        if (translated !== null) {
            return { tone: "warning", message: describeTranslated(translated) };
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

    function editText(next: string) {
        setText(next);
        // An edit makes Undo unsafe — it would throw the edit away — and makes
        // a translation failure about text that is no longer there.
        setTranslated(null);

        if (translation.state.phase === "failed") {
            translation.reset();
        }
    }

    function clearText() {
        editText("");
        setNotice(null);
        textareaRef.current?.focus();
    }

    function handleExtracted(result: Extract<ExtractionResult, { ok: true }>) {
        editText(result.text);
        setNotice({ format: result.format, truncated: result.truncated });
        setMode("text");
    }

    async function handleTranslate() {
        const original = text;
        const result = await translation.translate(
            original,
            translationTargetFor(getSpeechVoice(voice).locale),
        );

        if (result === null) {
            return;
        }

        setText(result.text);
        setNotice(null);
        setTranslated({ original, source: result.source, language: voiceLanguage });
    }

    function undoTranslation() {
        if (translated === null) {
            return;
        }

        setText(translated.original);
        setTranslated(null);
        textareaRef.current?.focus();
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

        return null;
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

                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {translated !== null ? (
                                    <Button
                                        variant="outline"
                                        onClick={undoTranslation}
                                        disabled={working}
                                        className="h-8 rounded-full px-3 text-[0.8125rem]"
                                    >
                                        <IconArrowBackUp
                                            className="size-4"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                        {t("undoTranslation")}
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        onClick={() => void handleTranslate()}
                                        disabled={text.trim().length === 0 || working}
                                        aria-label={t("translateLabel", { language: targetLabel })}
                                        title={t("translateLabel", { language: targetLabel })}
                                        className="h-8 rounded-full px-3 text-[0.8125rem]"
                                    >
                                        {translating ? (
                                            <IconLoader2
                                                className="size-4 animate-spin"
                                                aria-hidden="true"
                                            />
                                        ) : (
                                            <IconLanguage
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                        )}
                                        {t("translate")}
                                    </Button>
                                )}

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
                                onChange={(event) => editText(event.target.value)}
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
                                            editText(clampToLimit(text, MAX_SPEECH_CHARACTERS))
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

                        {/*
                         * One panel for the act of generating: the check, the
                         * button, then whatever is happening — side by side on
                         * a wide screen so neither floats alone.
                         */}
                        <div className="bg-muted/35 ring-border/70 flex min-w-0 flex-col gap-3 rounded-2xl p-3 ring-1 ring-inset sm:p-4">
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                                {siteKey !== null && configured && (
                                    // Reserves the widget's height so the row
                                    // does not jump once Cloudflare's script loads.
                                    <div className="min-h-[65px] w-full min-w-0 sm:w-75 sm:shrink-0">
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

                                {state.phase === "working" ? (
                                    <Button
                                        variant="outline"
                                        onClick={generation.cancel}
                                        className="h-12 min-w-0 flex-1 rounded-xl text-[0.9375rem]"
                                    >
                                        <IconPlayerStop
                                            className="size-4.5"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                        {t("cancel")}
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => void handleGenerate()}
                                        disabled={!canGenerate}
                                        className="h-12 min-w-0 flex-1 rounded-xl text-[0.9375rem] font-medium"
                                    >
                                        <IconWand
                                            className="size-4.5"
                                            stroke={1.8}
                                            aria-hidden="true"
                                        />
                                        {t("generate")}
                                    </Button>
                                )}
                            </div>

                            {state.phase === "working" && (
                                <div className="flex min-w-0 flex-col gap-2 px-0.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <IconLoader2
                                            className="text-primary size-3.5 shrink-0 animate-spin"
                                            aria-hidden="true"
                                        />
                                        <p
                                            role="status"
                                            className="text-muted-foreground min-w-0 text-[0.8125rem] leading-[1.4] tabular-nums"
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
                                    </div>
                                    {/* A real progressbar: a minute-long wait is exactly
                                        when somebody needs to know how far in they are. */}
                                    <div
                                        role="progressbar"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={percent}
                                        aria-label={t("progressLabel")}
                                        className="bg-background/70 h-1.5 w-full overflow-hidden rounded-full"
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
                                    className="px-0.5"
                                />
                            )}
                        </div>

                        {audio !== null && (
                            <div ref={resultRef} className="min-w-0">
                                <SpeechResult
                                    audio={audio}
                                    stale={stale}
                                    onDownload={handleDownload}
                                />
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
