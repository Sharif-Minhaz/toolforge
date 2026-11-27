"use client";

import { IconRefresh, IconTrophy } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/modules/tools/components/segmented-control";
import { savePersonalBest, usePersonalBests } from "@/modules/tools/components/use-personal-best";
import { useFitIntoView, useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { StepLabel } from "@/modules/tools/components/workbench-step";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import {
    applyTypingValue,
    createTypingRun,
    drawTypingWords,
    finishTyping,
    isExpired,
    isOnTrack,
    scoreWord,
    summarizeTyping,
    wordsForDuration,
} from "../domain/typing";
import { DEFAULT_TYPING_EXTRAS } from "../domain/constants";
import {
    TYPING_DURATIONS,
    TYPING_EXTRAS,
    TYPING_LANGUAGES,
    type TypingExtra,
    type TypingExtras,
    type TypingDuration,
    type TypingLanguage,
    type TypingRun,
} from "../types";
import { SpeedChart } from "./speed-chart";

/** How often the clock under the text redraws while a run is live. */
const TICK_MS = 100;

/**
 * Bangla is judged and coloured a word at a time. Colouring it a letter at a
 * time would put a conjunct's halves in different spans, and a browser shapes
 * each span on its own — `ক্ষ` would fall apart into `ক্` and `ষ` on screen.
 */
const LETTER_FEEDBACK: Record<TypingLanguage, boolean> = { english: true, bangla: false };

/** A glimpse of each extra on its switch; data, not copy. */
const EXTRA_SAMPLES: Record<TypingExtra, string> = {
    capitals: "Aa",
    camelCase: "aB",
    symbols: "{;}",
    numbers: "42",
};

/** Extras that mean something in a script: Bangla has no case. */
function activeExtras(language: TypingLanguage, extras: TypingExtras): TypingExtra[] {
    return TYPING_EXTRAS.filter(
        (extra) => extras[extra] && (language === "english" || !CASED_EXTRAS.has(extra)),
    );
}

const CASED_EXTRAS: ReadonlySet<TypingExtra> = new Set(["capitals", "camelCase"]);

/**
 * A best is only comparable with the same settings, so the extras are part of
 * the key. A run with none keeps the key it always had, so bests set before
 * the extras existed still count.
 */
function personalBestKey(
    language: TypingLanguage,
    duration: TypingDuration,
    extras: TypingExtras,
): string {
    const active = activeExtras(language, extras);

    return `typing:${language}:${duration}${active.length === 0 ? "" : `:${active.join("+")}`}`;
}

type TypingPanelProps = {
    /** Drawn on the server, so both renders show the same first text. */
    initialWords: readonly string[];
    initialLanguage: TypingLanguage;
    initialDuration: TypingDuration;
    /** Whether this mode is the one showing; see the effect that reads it. */
    active?: boolean;
};

export function TypingPanel({
    initialWords,
    initialLanguage,
    initialDuration,
    active = false,
}: TypingPanelProps) {
    const t = useTranslations("keyboardTester.typing");
    const formatter = useFormatter();
    const bests = usePersonalBests();

    const inputRef = useRef<HTMLInputElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const languageLabelId = useId();
    const durationLabelId = useId();
    const extrasLabelId = useId();
    const extrasHintId = useId();
    const inputId = useId();
    const hintId = useId();

    const [language, setLanguage] = useState(initialLanguage);
    const [duration, setDuration] = useState(initialDuration);
    const [extras, setExtras] = useState<TypingExtras>(DEFAULT_TYPING_EXTRAS);
    const [run, setRun] = useState<TypingRun>(() => createTypingRun(initialWords));
    /** `performance.now()` at the last tick or keystroke; `null` until a run starts. */
    const [now, setNow] = useState<number | null>(null);
    /**
     * The best on record when this run's first key was pressed, so the result
     * can say whether this run beat it — after it is saved, the store alone
     * cannot tell a new record from an old one.
     */
    const [bestBefore, setBestBefore] = useState(0);

    const durationMs = duration * 1000;
    const bestKey = personalBestKey(language, duration, extras);
    // The clock's end is derived, not stored: a run whose reader stopped typing
    // is over the moment a tick passes the deadline, without waiting for a key.
    const settled =
        now !== null && isExpired(run, now, durationMs) ? finishTyping(run, now, durationMs) : run;
    const running = settled.startedAt !== null && settled.endedAt === null;
    const finished = settled.endedAt !== null;
    const { ref: resultRef, scrollToResult } = useResultScroll();
    const { ref: stageRef, fitIntoView } = useFitIntoView();
    // Opening this mode from the switch above frames it on screen and puts the caret in the box,
    // ready for the first key. Only
    // on the switch itself — never on load, where a shared link to this mode
    // should not yank the page — so the last state is held in a ref.
    const wasActive = useRef(active);

    useEffect(() => {
        if (active && !wasActive.current) {
            // Focus without the browser's own jump; the fit below does the framing.
            inputRef.current?.focus({ preventScroll: true });
            fitIntoView();
        }

        wasActive.current = active;
    }, [active, fitIntoView]);

    const summary = summarizeTyping(settled, settled.endedAt ?? now ?? 0, durationMs);
    const finalWpm = finished ? Math.round(summary.wpm) : 0;
    const newBest = finished && finalWpm > bestBefore;

    // The clock: only while a run is live.
    useEffect(() => {
        if (!running) {
            return;
        }

        const timer = window.setInterval(() => setNow(performance.now()), TICK_MS);

        return () => window.clearInterval(timer);
    }, [running]);

    // Saving is idempotent — the store keeps the higher of the two — so a
    // second pass over the same finished run changes nothing.
    useEffect(() => {
        if (finalWpm > 0) {
            savePersonalBest(bestKey, finalWpm);
        }
    }, [bestKey, finalWpm]);

    // The result is drawn below the arena when the run ends — by the clock or
    // by the last press — which is below the fold on a laptop. Bring it up
    // once per finished run; the hook leaves it alone if it is already in view.
    useEffect(() => {
        if (finished) {
            scrollToResult();
        }
    }, [finished, scrollToResult]);

    // Keeps the word under the caret on the second line of three, by moving
    // the text rather than scrolling a box — a scrolled box would let the
    // wheel pull the caret out of sight. Measured after layout, written
    // straight to the style: nothing here is state.
    useLayoutEffect(() => {
        const text = textRef.current;
        const current = text?.querySelector<HTMLElement>("[data-current='true']");

        if (!text) {
            return;
        }

        const shift = current ? Math.max(0, current.offsetTop - current.offsetHeight) : 0;

        text.style.transform = `translateY(${-shift}px)`;
    }, [run.typed.length, run.words, language]);

    const best = bests[bestKey];
    const remainingMs =
        settled.startedAt === null
            ? durationMs
            : Math.max(
                  0,
                  durationMs - ((settled.endedAt ?? now ?? settled.startedAt) - settled.startedAt),
              );

    function restart(nextLanguage = language, nextDuration = duration, nextExtras = extras) {
        const words = drawTypingWords(
            nextLanguage,
            wordsForDuration(nextDuration),
            cryptoRandomBytes,
            nextExtras,
        );

        setRun(createTypingRun(words));
        setNow(null);
        inputRef.current?.focus();
    }

    function handleChange(value: string) {
        const at = performance.now();

        if (settled.startedAt === null) {
            setBestBefore(best ?? 0);
        }

        setRun(applyTypingValue(settled, value, at, durationMs));
        setNow(at);
    }

    const seconds = (ms: number) => formatter.number(Math.ceil(ms / 1000));
    const percent = (value: number) =>
        formatter.number(value, { style: "percent", maximumFractionDigits: 0 });
    const whole = (value: number) => formatter.number(Math.round(value));

    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="border-border/70 flex flex-col gap-4 border-b p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label id={languageLabelId} className="text-muted-foreground text-xs">
                                {t("language")}
                            </Label>
                            <SegmentedControl
                                size="sm"
                                options={TYPING_LANGUAGES.map((value) => ({
                                    value,
                                    label: t(`languages.${value}`),
                                }))}
                                value={language}
                                labelId={languageLabelId}
                                layoutId="typing-language-indicator"
                                onChange={(value) => {
                                    setLanguage(value);
                                    restart(value, duration);
                                }}
                            />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label id={durationLabelId} className="text-muted-foreground text-xs">
                                {t("duration")}
                            </Label>
                            <SegmentedControl
                                size="sm"
                                options={TYPING_DURATIONS.map((value) => ({
                                    value: String(value),
                                    label: t("seconds", { value: formatter.number(value) }),
                                }))}
                                value={String(duration)}
                                labelId={durationLabelId}
                                layoutId="typing-duration-indicator"
                                onChange={(value) => {
                                    const next =
                                        TYPING_DURATIONS.find(
                                            (option) => String(option) === value,
                                        ) ?? duration;

                                    setDuration(next);
                                    restart(language, next);
                                }}
                            />
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => restart()}
                    >
                        <IconRefresh className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("restart")}
                    </Button>
                </div>

                {/* Extras: switches rather than a select, because they combine. */}
                <div className="flex flex-col gap-1.5">
                    <span id={extrasLabelId} className="text-muted-foreground text-xs font-medium">
                        {t("extras.label")}
                    </span>
                    <div
                        role="group"
                        aria-labelledby={extrasLabelId}
                        aria-describedby={extrasHintId}
                        className="flex flex-wrap gap-1.5"
                    >
                        {TYPING_EXTRAS.map((extra) => {
                            const unavailable = language === "bangla" && CASED_EXTRAS.has(extra);
                            const on = extras[extra] && !unavailable;

                            return (
                                <button
                                    key={extra}
                                    type="button"
                                    aria-pressed={on}
                                    disabled={unavailable}
                                    onClick={() => {
                                        const next = { ...extras, [extra]: !extras[extra] };

                                        setExtras(next);
                                        restart(language, duration, next);
                                    }}
                                    className={cn(
                                        "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium ring-1 transition-colors duration-200 ring-inset",
                                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                        "disabled:cursor-not-allowed disabled:opacity-45",
                                        on
                                            ? "bg-primary/10 text-primary ring-primary/30"
                                            : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground",
                                    )}
                                >
                                    <span className="font-mono text-xs" aria-hidden="true">
                                        {EXTRA_SAMPLES[extra]}
                                    </span>
                                    {t(`extras.options.${extra}`)}
                                </button>
                            );
                        })}
                    </div>
                    <p
                        id={extrasHintId}
                        className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                    >
                        {language === "bangla" ? t("extras.hintBangla") : t("extras.hint")}
                    </p>
                </div>
            </div>

            <div ref={stageRef} className="flex flex-col gap-3 p-4 sm:p-5">
                <StepLabel step={1}>{t("stepType")}</StepLabel>

                <div className="flex flex-wrap items-end justify-between gap-3">
                    <LiveFigure
                        label={t("timeLeft")}
                        value={t("seconds", { value: seconds(remainingMs) })}
                        emphasis={running}
                    />
                    <div className="flex gap-6">
                        <LiveFigure label={t("wpm")} value={whole(summary.wpm)} />
                        <LiveFigure
                            label={t("accuracy")}
                            value={settled.startedAt === null ? "—" : percent(summary.accuracy)}
                        />
                        <LiveFigure
                            label={t("best")}
                            value={best === undefined ? "—" : whole(best)}
                        />
                    </div>
                </div>

                {/* Three lines of text; the line holding the caret stays in the
                    middle once the first one has been typed. */}
                <div
                    aria-hidden="true"
                    className={cn(
                        "bg-muted/20 ring-border/70 relative h-[calc(3*2.5rem+1.5rem)] overflow-hidden rounded-2xl px-4 py-3 ring-1 ring-inset sm:px-5",
                        finished && "opacity-55",
                    )}
                    onClick={() => inputRef.current?.focus()}
                >
                    <div
                        ref={textRef}
                        className={cn(
                            "flex flex-wrap gap-x-[0.6em] text-xl leading-10 transition-transform duration-200 sm:text-2xl",
                            language === "english" ? "font-mono" : "font-sans",
                        )}
                    >
                        {settled.words.map((word, index) => (
                            <Word
                                key={index}
                                target={word}
                                typed={
                                    index < settled.typed.length
                                        ? settled.typed[index]
                                        : index === settled.typed.length
                                          ? settled.current
                                          : null
                                }
                                state={
                                    index < settled.typed.length
                                        ? "done"
                                        : index === settled.typed.length
                                          ? "current"
                                          : "upcoming"
                                }
                                letters={LETTER_FEEDBACK[language]}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor={inputId} className="sr-only">
                        {t("inputLabel")}
                    </Label>
                    <input
                        ref={inputRef}
                        id={inputId}
                        type="text"
                        value={run.current}
                        disabled={finished}
                        onChange={(event) => handleChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                event.preventDefault();
                                restart();
                            }
                        }}
                        // Pasting the text is not typing it.
                        onPaste={(event) => event.preventDefault()}
                        onDrop={(event) => event.preventDefault()}
                        aria-describedby={hintId}
                        // The word to type, for a screen reader: the text above is
                        // drawn for the eye and hidden from assistive technology.
                        aria-label={t("inputLabelWithWord", {
                            word: run.words[run.typed.length] ?? "",
                        })}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        lang={language === "bangla" ? "bn" : "en"}
                        placeholder={run.startedAt === null ? t("placeholder") : undefined}
                        className={cn(
                            "border-input bg-background h-12 w-full rounded-xl border px-4 text-lg shadow-xs outline-none",
                            "focus-visible:border-ring focus-visible:ring-ring/50 transition-[box-shadow,border-color] duration-200 focus-visible:ring-3",
                            "disabled:opacity-55",
                            language === "english" && "font-mono",
                            run.current.length > 0 &&
                                !isOnTrack(run.words[run.typed.length] ?? "", run.current) &&
                                "border-destructive/60 text-destructive",
                        )}
                    />
                    <p id={hintId} className="text-muted-foreground text-[0.75rem] leading-5">
                        {t("hint")}
                    </p>
                </div>
            </div>

            {/* Always mounted, so the scroll has somewhere to aim the moment the result lands. */}
            <div ref={resultRef}>
                {finished && (
                    <TypingResult
                        summary={summary}
                        newBest={newBest}
                        labels={{
                            title: t("result.title"),
                            wpm: t("wpm"),
                            raw: t("result.raw"),
                            accuracy: t("accuracy"),
                            consistency: t("result.consistency"),
                            words: t("result.words"),
                            characters: t("result.characters"),
                            corrections: t("result.corrections"),
                            newBest: t("result.newBest"),
                            chart: t("result.chart"),
                            chartEmpty: t("result.chartEmpty"),
                        }}
                        format={{ whole, percent }}
                        wordsValue={t("result.wordsValue", {
                            correct: whole(summary.correctWords),
                            incorrect: whole(summary.incorrectWords),
                        })}
                        charactersValue={t("result.charactersValue", {
                            correct: whole(summary.correct),
                            incorrect: whole(summary.incorrect),
                            extra: whole(summary.extra),
                            missed: whole(summary.missed),
                        })}
                        onRestart={() => restart()}
                        restartLabel={t("again")}
                    />
                )}
            </div>
        </Card>
    );
}

type WordProps = {
    target: string;
    /** What was typed against it; `null` for a word not reached yet. */
    typed: string | null;
    state: "done" | "current" | "upcoming";
    letters: boolean;
};

function Word({ target, typed, state, letters }: WordProps) {
    if (state === "upcoming" || typed === null) {
        return <span className="text-muted-foreground/70">{target}</span>;
    }

    const wrong = state === "done" ? !scoreWord(target, typed).exact : !isOnTrack(target, typed);

    if (!letters) {
        return (
            <span
                data-current={state === "current"}
                className={cn(
                    "rounded-md transition-colors duration-150",
                    state === "current" && "bg-primary/10 ring-primary/25 ring-1",
                    wrong
                        ? "text-destructive underline decoration-wavy underline-offset-[0.3em]"
                        : state === "done"
                          ? "text-foreground"
                          : "text-muted-foreground",
                )}
            >
                {target}
            </span>
        );
    }

    const want = [...target];
    const got = [...typed];

    return (
        <span
            data-current={state === "current"}
            className={cn(
                "rounded-md",
                state === "current" && "bg-primary/10 ring-primary/25 ring-1",
                state === "done" &&
                    wrong &&
                    "decoration-destructive/70 underline decoration-wavy underline-offset-[0.3em]",
            )}
        >
            {want.map((character, index) => {
                const entered = got[index];

                return (
                    <span
                        key={index}
                        className={cn(
                            entered === undefined
                                ? state === "done"
                                    ? "text-muted-foreground/50"
                                    : "text-muted-foreground/70"
                                : entered === character
                                  ? "text-foreground"
                                  : "text-destructive",
                            state === "current" &&
                                index === got.length &&
                                "border-primary -ml-px border-l-2",
                        )}
                    >
                        {character}
                    </span>
                );
            })}
            {got.slice(want.length).map((character, index) => (
                <span key={`extra-${index}`} className="text-destructive/70">
                    {character}
                </span>
            ))}
        </span>
    );
}

function LiveFigure({
    label,
    value,
    emphasis = false,
}: {
    label: string;
    value: string;
    emphasis?: boolean;
}) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs font-medium">{label}</span>
            <span
                aria-live={emphasis ? "off" : undefined}
                className={cn(
                    "font-mono text-2xl font-semibold tabular-nums",
                    emphasis && "text-primary",
                )}
            >
                {value}
            </span>
        </div>
    );
}

type TypingResultProps = {
    summary: ReturnType<typeof summarizeTyping>;
    newBest: boolean;
    labels: Record<
        | "title"
        | "wpm"
        | "raw"
        | "accuracy"
        | "consistency"
        | "words"
        | "characters"
        | "corrections"
        | "newBest"
        | "chart"
        | "chartEmpty",
        string
    >;
    format: { whole: (value: number) => string; percent: (value: number) => string };
    wordsValue: string;
    charactersValue: string;
    onRestart: () => void;
    restartLabel: string;
};

function TypingResult({
    summary,
    newBest,
    labels,
    format,
    wordsValue,
    charactersValue,
    onRestart,
    restartLabel,
}: TypingResultProps) {
    return (
        <section
            aria-label={labels.title}
            className="border-border/70 flex flex-col gap-4 border-t p-4 sm:p-5"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-medium">{labels.title}</h3>
                <div className="flex items-center gap-2">
                    {newBest && (
                        <span className="bg-success/12 text-success ring-success/30 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-medium ring-1 ring-inset">
                            <IconTrophy className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {labels.newBest}
                        </span>
                    )}
                    <Button size="sm" onClick={onRestart}>
                        <IconRefresh className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {restartLabel}
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                <dl className="grid grid-cols-2 gap-2">
                    <ResultTile label={labels.wpm} value={format.whole(summary.wpm)} large />
                    <ResultTile
                        label={labels.accuracy}
                        value={format.percent(summary.accuracy)}
                        large
                    />
                    <ResultTile label={labels.raw} value={format.whole(summary.rawWpm)} />
                    <ResultTile
                        label={labels.consistency}
                        value={
                            summary.consistency === null ? "—" : format.percent(summary.consistency)
                        }
                    />
                    <ResultTile label={labels.words} value={wordsValue} />
                    <ResultTile
                        label={labels.corrections}
                        value={format.whole(summary.corrections)}
                    />
                    <div className="col-span-2">
                        <ResultTile label={labels.characters} value={charactersValue} />
                    </div>
                </dl>
                <SpeedChart
                    values={summary.perSecond}
                    label={labels.chart}
                    emptyLabel={labels.chartEmpty}
                />
            </div>
        </section>
    );
}

function ResultTile({
    label,
    value,
    large = false,
}: {
    label: string;
    value: ReactNode;
    large?: boolean;
}) {
    return (
        <div className="ring-border/60 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5 ring-1 ring-inset">
            <dt className="text-muted-foreground truncate text-xs font-medium">{label}</dt>
            <dd
                className={cn(
                    "font-mono font-semibold tabular-nums",
                    large ? "text-3xl" : "text-base",
                )}
            >
                {value}
            </dd>
        </div>
    );
}
