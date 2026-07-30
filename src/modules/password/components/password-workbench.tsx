"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { LIVE_UPDATE_DEBOUNCE_MS } from "@/hooks/use-debounced-value";
import { logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import {
    ALPHABETS,
    AMBIGUOUS_CHARACTERS,
    SIMILAR_CHARACTERS,
    supportsCharacterPool,
} from "../domain/alphabets";
import { PASSWORD_LENGTH_RANGE } from "../domain/constants";
import { estimateCrackTime } from "../domain/crack-time";
import { clampLength, generatePassword } from "../domain/generate";
import {
    ATTACK_MODELS,
    CHARACTER_CLASSES,
    PASSWORD_SEPARATORS,
    type AttackModel,
    type CharacterClass,
    type PasswordGenerationSuccess,
    type PasswordMode,
    type PasswordOptions,
    type PasswordSeparator,
} from "../types";
import { ModeSelector } from "./mode-selector";
import { PasswordOutput } from "./password-output";
import { StrengthMeter } from "./strength-meter";

/**
 * What each class actually contributes. Character ranges are data, not copy, so
 * they are derived from the alphabets rather than written into the catalogue.
 */
const CLASS_HINTS: Record<CharacterClass, string> = {
    uppercase: `${ALPHABETS.uppercase[0]}–${ALPHABETS.uppercase.at(-1)}`,
    lowercase: `${ALPHABETS.lowercase[0]}–${ALPHABETS.lowercase.at(-1)}`,
    numbers: `${ALPHABETS.numbers[0]}–${ALPHABETS.numbers.at(-1)}`,
    symbols: `${ALPHABETS.symbols.slice(0, 10)}…`,
};

type PasswordWorkbenchProps = {
    /** Read from the link on the server; the password itself is not. */
    initialOptions: PasswordOptions;
};

export function PasswordWorkbench({ initialOptions }: PasswordWorkbenchProps) {
    const t = useTranslations("password.workbench");
    const tToast = useTranslations("password.toast");
    const tErrors = useTranslations("password.errors");
    const tSeparators = useTranslations("password.separators");
    const tAttacks = useTranslations("password.attacks");
    const tStrengths = useTranslations("password.strengths");
    const formatter = useFormatter();

    const modeLabelId = useId();
    const lengthLabelId = useId();

    const [options, setOptions] = useState<PasswordOptions>(initialOptions);
    const [result, setResult] = useState<PasswordGenerationSuccess | null>(null);
    const [pending, setPending] = useState(false);
    const [spinToken, setSpinToken] = useState(0);
    const [copied, setCopied] = useCopyFeedback<string>();

    const timer = useRef<number | null>(null);
    // Captured once: the mount generation uses the options the link arrived with,
    // and any interaction before it fires cancels it outright.
    const mountOptions = useRef(initialOptions);

    const range = PASSWORD_LENGTH_RANGE[options.mode];
    const poolAvailable = supportsCharacterPool(options.mode);
    const wordsAvailable = options.mode === "memorable";
    const noClassSelected = poolAvailable && !CHARACTER_CLASSES.some((name) => options[name]);

    const crackTime =
        result === null ? null : estimateCrackTime(result.entropyBits, options.attack);

    const cancelScheduled = useCallback(() => {
        if (timer.current === null) {
            return;
        }

        window.clearTimeout(timer.current);
        timer.current = null;
    }, []);

    const regenerate = useCallback(
        (next: PasswordOptions) => {
            const generated = generatePassword(next);

            if (!generated.ok) {
                // Never the password, and never the options that shaped it — the
                // reason is the whole of what a log needs to be useful here.
                logEvent("error", "password.generation_failed", { reason: generated.reason });
                toast.error(tErrors("generic"));
                setPending(false);

                return;
            }

            setResult(generated);
            setPending(false);
        },
        [tErrors],
    );

    const schedule = useCallback(
        (next: PasswordOptions, delayMs: number) => {
            cancelScheduled();
            timer.current = window.setTimeout(() => {
                timer.current = null;
                regenerate(next);
            }, delayMs);
        },
        [cancelScheduled, regenerate],
    );

    /**
     * The first password is composed here, in the browser, and never on the
     * server. A generated secret in an HTTP response body is a secret in server
     * logs, in a TLS-terminating proxy and in whatever buffered the response —
     * so the server renders a placeholder and this fills it in.
     */
    useEffect(() => {
        schedule(mountOptions.current, 0);

        return cancelScheduled;
    }, [schedule, cancelScheduled]);

    /**
     * `immediate` separates a deliberate choice — a toggle, a preset, the button
     * — from dragging the slider, where every pixel would otherwise mint and
     * render a new password on the way to the length actually wanted.
     */
    function applyOptions(next: PasswordOptions, immediate: boolean) {
        setOptions(next);

        if (supportsCharacterPool(next.mode) && !CHARACTER_CLASSES.some((name) => next[name])) {
            cancelScheduled();
            setPending(false);

            return;
        }

        if (immediate) {
            cancelScheduled();
            regenerate(next);

            return;
        }

        setPending(true);
        schedule(next, LIVE_UPDATE_DEBOUNCE_MS);
    }

    function handleModeChange(mode: PasswordMode) {
        // Each mode counts something different, so the value comes with it: 20
        // characters is a fine password and 20 words is not a passphrase.
        applyOptions({ ...options, mode, length: clampLength(mode, options.length) }, true);
    }

    function handleLengthChange(next: number | readonly number[]) {
        const value = Array.isArray(next) ? (next[0] ?? options.length) : Number(next);

        applyOptions({ ...options, length: clampLength(options.mode, value) }, false);
    }

    function handleRegenerate() {
        if (noClassSelected) {
            return;
        }

        setSpinToken((current) => current + 1);
        applyOptions(options, true);
    }

    async function handleCopy() {
        if (result === null) {
            return;
        }

        const outcome = await copyText(result.password);

        if (!outcome.ok) {
            reportCopyFailure(outcome);

            return;
        }

        setCopied("password");
        toast.success(tToast("copied"));
    }

    function reportCopyFailure(failure: Extract<CopyResult, { ok: false }>) {
        const message =
            failure.reason === "empty"
                ? tToast("copyFailedEmpty")
                : failure.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    return (
        <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <PasswordOutput
                    password={result?.password ?? null}
                    stale={pending}
                    copied={copied === "password"}
                    spinToken={spinToken}
                    disabled={noClassSelected}
                    onCopy={handleCopy}
                    onRegenerate={handleRegenerate}
                />

                {result !== null && crackTime !== null && (
                    <StrengthMeter
                        strength={result.strength}
                        crackTime={crackTime}
                        attack={options.attack}
                        stale={pending}
                    />
                )}

                {/* Says what changed, never the value: a password read aloud is a
                    password overheard. */}
                <p role="status" className="sr-only">
                    {result === null
                        ? ""
                        : t("announcement", {
                              count: result.password.length,
                              strength: tStrengths(result.strength),
                          })}
                </p>

                <Separator />

                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label id={modeLabelId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("modeLabel")}</span>
                        </Label>
                        <ModeSelector
                            value={options.mode}
                            onChange={handleModeChange}
                            labelId={modeLabelId}
                        />
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label id={lengthLabelId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">
                                {t(`lengthLabel.${options.mode}`)}
                            </span>
                        </Label>
                        <div className="flex h-10 min-w-0 items-center gap-3">
                            <Slider
                                aria-labelledby={lengthLabelId}
                                value={[options.length]}
                                min={range.min}
                                max={range.max}
                                step={1}
                                onValueChange={handleLengthChange}
                                className="min-w-0 flex-1"
                            />
                            <span className="w-9 shrink-0 text-right font-mono text-sm tabular-nums">
                                {options.length}
                            </span>
                        </div>
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("lengthHint", { min: range.min, max: range.max })}
                        </p>
                    </div>
                </div>

                <Separator />

                <div className="flex min-w-0 flex-col gap-2">
                    <GroupLabel>{t("charactersGroup")}</GroupLabel>

                    <div className="grid gap-2 sm:grid-cols-2">
                        {CHARACTER_CLASSES.map((name) => (
                            <OptionSwitch
                                key={name}
                                label={t(`classes.${name}`)}
                                hint={poolAvailable ? CLASS_HINTS[name] : t("classesUnavailable")}
                                checked={options[name]}
                                disabled={!poolAvailable}
                                onCheckedChange={(checked) =>
                                    applyOptions({ ...options, [name]: checked }, true)
                                }
                            />
                        ))}
                    </div>

                    {noClassSelected && (
                        <StatusStrip tone="error" message={tErrors("noCharacterClass")} />
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    <GroupLabel>{t("exclusionsGroup")}</GroupLabel>

                    <div className="grid gap-2 sm:grid-cols-2">
                        <OptionSwitch
                            label={t("excludeSimilar")}
                            hint={poolAvailable ? SIMILAR_CHARACTERS : t("classesUnavailable")}
                            checked={options.excludeSimilar}
                            disabled={!poolAvailable}
                            onCheckedChange={(excludeSimilar) =>
                                applyOptions({ ...options, excludeSimilar }, true)
                            }
                        />
                        <OptionSwitch
                            label={t("excludeAmbiguous")}
                            hint={poolAvailable ? AMBIGUOUS_CHARACTERS : t("classesUnavailable")}
                            checked={options.excludeAmbiguous}
                            disabled={!poolAvailable}
                            onCheckedChange={(excludeAmbiguous) =>
                                applyOptions({ ...options, excludeAmbiguous }, true)
                            }
                        />
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    <GroupLabel>{t("passphraseGroup")}</GroupLabel>

                    <div className="grid gap-2 sm:grid-cols-2">
                        <OptionSelect<PasswordSeparator>
                            label={t("separatorLabel")}
                            hint={
                                wordsAvailable
                                    ? tSeparators(`${options.separator}.hint`)
                                    : t("passphraseUnavailable")
                            }
                            value={options.separator}
                            items={Object.fromEntries(
                                PASSWORD_SEPARATORS.map((separator) => [
                                    separator,
                                    tSeparators(`${separator}.label`),
                                ]),
                            )}
                            values={PASSWORD_SEPARATORS}
                            disabled={!wordsAvailable}
                            onChange={(separator) => applyOptions({ ...options, separator }, true)}
                        />

                        <div className="grid gap-2">
                            <OptionSwitch
                                label={t("capitalize")}
                                hint={
                                    wordsAvailable
                                        ? t("capitalizeHint")
                                        : t("passphraseUnavailable")
                                }
                                checked={options.capitalize}
                                disabled={!wordsAvailable}
                                onCheckedChange={(capitalize) =>
                                    applyOptions({ ...options, capitalize }, true)
                                }
                            />
                            <OptionSwitch
                                label={t("includeNumber")}
                                hint={
                                    wordsAvailable
                                        ? t("includeNumberHint")
                                        : t("passphraseUnavailable")
                                }
                                checked={options.includeNumber}
                                disabled={!wordsAvailable}
                                onCheckedChange={(includeNumber) =>
                                    applyOptions({ ...options, includeNumber }, true)
                                }
                            />
                        </div>
                    </div>
                </div>

                <Separator />

                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <OptionSelect<AttackModel>
                        label={t("attackLabel")}
                        hint={tAttacks(`${options.attack}.hint`)}
                        value={options.attack}
                        items={Object.fromEntries(
                            ATTACK_MODELS.map((model) => [model, tAttacks(`${model}.label`)]),
                        )}
                        values={ATTACK_MODELS}
                        // Changing the attacker asks a different question about
                        // the same password, so it must not mint a new one.
                        onChange={(attack) => setOptions((current) => ({ ...current, attack }))}
                    />

                    {result !== null && (
                        <dl
                            aria-label={t("statsLabel")}
                            className={cn(
                                "grid grid-cols-2 gap-2 transition-opacity duration-200",
                                pending && "opacity-55",
                            )}
                        >
                            <Stat
                                label={t("stats.entropy")}
                                value={t("bits", {
                                    value: formatter.number(result.entropyBits, {
                                        maximumFractionDigits: 1,
                                    }),
                                })}
                            />
                            <Stat
                                label={t("stats.pool")}
                                value={t(`poolUnit.${options.mode}`, { count: result.poolSize })}
                            />
                        </dl>
                    )}
                </div>

                {result !== null && (
                    <dl
                        aria-label={t("compositionLabel")}
                        className={cn(
                            "grid grid-cols-2 gap-2 transition-opacity duration-200 sm:grid-cols-4",
                            pending && "opacity-55",
                        )}
                    >
                        {CHARACTER_CLASSES.map((name) => (
                            <Stat
                                key={name}
                                label={t(`classes.${name}`)}
                                value={formatter.number(result.composition[name])}
                            />
                        ))}
                    </dl>
                )}
            </CardContent>
        </Card>
    );
}

function GroupLabel({ children }: { children: string }) {
    return (
        <p className="text-muted-foreground/85 text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
            {children}
        </p>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
            <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">{label}</dt>
            <dd className="truncate font-mono text-sm tabular-nums">{value}</dd>
        </div>
    );
}
