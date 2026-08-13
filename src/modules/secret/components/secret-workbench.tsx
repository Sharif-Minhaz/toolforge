"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LIVE_UPDATE_DEBOUNCE_MS } from "@/hooks/use-debounced-value";
import { logEvent } from "@/modules/observability/domain/logger";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { NumberStepper } from "@/modules/tools/components/number-stepper";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import {
    MAX_SECRET_BYTES,
    MAX_VARIABLE_NAME_LENGTH,
    MIN_SECRET_BYTES,
    SECRET_BYTE_PRESETS,
    SECRET_ENCODING_LABELS,
    SECRET_KEY_USE_LABELS,
} from "../domain/constants";
import { supportsPadding } from "../domain/encodings";
import {
    clampByteLength,
    describeSecret,
    drawSecretBytes,
    isValidByteLength,
} from "../domain/generate";
import { isValidVariableName, sanitizeVariableName, supportsVariableName } from "../domain/shape";
import {
    SECRET_ENCODINGS,
    SECRET_SHAPES,
    type SecretEncoding,
    type SecretOptions,
    type SecretShape,
} from "../types";
import { SecretOutput } from "./secret-output";

type SecretWorkbenchProps = {
    /** Read from the link on the server; the secret itself is not. */
    initialOptions: SecretOptions;
};

export function SecretWorkbench({ initialOptions }: SecretWorkbenchProps) {
    const t = useTranslations("secret.workbench");
    const tEncodings = useTranslations("secret.encodings");
    const tShapes = useTranslations("secret.shapes");
    const tGrades = useTranslations("secret.grades");
    const tToast = useTranslations("secret.toast");
    const tErrors = useTranslations("secret.errors");
    const formatter = useFormatter();

    const byteInputId = useId();
    const byteHintId = useId();
    const nameInputId = useId();
    const nameHintId = useId();

    const [options, setOptions] = useState<SecretOptions>(initialOptions);
    const [byteInput, setByteInput] = useState(String(initialOptions.byteLength));
    const [bytes, setBytes] = useState<Uint8Array | null>(null);
    const [pending, setPending] = useState(false);
    const [spinToken, setSpinToken] = useState(0);
    const [copied, setCopied] = useCopyFeedback<"secret" | "command">();

    const timer = useRef<number | null>(null);
    // Captured once: the mount draw uses the length the link arrived with, and
    // any interaction before it fires cancels it outright.
    const mountLength = useRef(initialOptions.byteLength);

    const byteInvalid = !isValidByteLength(Number.parseInt(byteInput, 10));
    const paddingAvailable = supportsPadding(options.encoding);
    const nameAvailable = supportsVariableName(options.shape);
    const nameInvalid = nameAvailable && !isValidVariableName(options.variableName);

    /**
     * Derived during render rather than stored, which is what lets every
     * control except the byte count change the answer without drawing a new
     * secret. Switching from hex to base64url asks how to write this value
     * down; it is not a request for a different one, and redrawing there would
     * mean a reader comparing two encodings never sees the same key twice.
     *
     * A name the shell would reject falls back to the bare shape rather than
     * emitting `2FA=…`, which is a line no `.env` reader accepts. The secret
     * stays on screen and the field below says what is wrong with the name.
     */
    const result =
        bytes === null
            ? null
            : describeSecret(bytes, nameInvalid ? { ...options, shape: "bare" } : options);

    const cancelScheduled = useCallback(() => {
        if (timer.current === null) {
            return;
        }

        window.clearTimeout(timer.current);
        timer.current = null;
    }, []);

    const redraw = useCallback(
        (byteLength: number) => {
            const drawn = drawSecretBytes(byteLength);

            if (drawn === null) {
                // Never the secret, and never the bytes — the length is the
                // whole of what a log needs to be useful here.
                logEvent("error", "secret.draw_failed", { byteLength });
                toast.error(tErrors("generic"));
                setPending(false);

                return;
            }

            setBytes(drawn);
            setPending(false);
        },
        [tErrors],
    );

    const schedule = useCallback(
        (byteLength: number, delayMs: number) => {
            cancelScheduled();
            timer.current = window.setTimeout(() => {
                timer.current = null;
                redraw(byteLength);
            }, delayMs);
        },
        [cancelScheduled, redraw],
    );

    /**
     * The first secret is drawn here, in the browser, and never on the server.
     * A generated key in an HTTP response body is a key in server logs, in a
     * TLS-terminating proxy and in whatever buffered the response — so the
     * server renders a placeholder and this fills it in.
     */
    useEffect(() => {
        schedule(mountLength.current, 0);

        return cancelScheduled;
    }, [schedule, cancelScheduled]);

    /**
     * `immediate` separates a deliberate choice — a preset, a step, the button
     * — from typing, where every keystroke on the way to `128` would otherwise
     * draw a secret at 1, 12 and 128 in turn.
     */
    function applyByteLength(raw: string, immediate: boolean) {
        // Three digits reaches the 512 ceiling; the stepper allows two more so
        // the field can go invalid and say so.
        const sanitized = raw.replace(/\D/g, "").slice(0, String(MAX_SECRET_BYTES).length + 2);
        setByteInput(sanitized);

        const parsed = Number.parseInt(sanitized, 10);

        if (!isValidByteLength(parsed)) {
            cancelScheduled();
            setPending(false);

            return;
        }

        setOptions((current) => ({ ...current, byteLength: parsed }));

        if (immediate) {
            cancelScheduled();
            redraw(parsed);

            return;
        }

        setPending(true);
        schedule(parsed, LIVE_UPDATE_DEBOUNCE_MS);
    }

    function handleStep(delta: number) {
        applyByteLength(String(clampByteLength(options.byteLength + delta)), true);
    }

    function handleRegenerate() {
        setSpinToken((current) => current + 1);
        cancelScheduled();
        setPending(false);
        redraw(options.byteLength);
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

    async function handleCopy(panel: "secret" | "command", text: string) {
        const outcome = await copyText(text);

        if (!outcome.ok) {
            reportCopyFailure(outcome);

            return;
        }

        setCopied(panel);
        toast.success(panel === "secret" ? tToast("copied") : tToast("copiedCommand"));
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
                <SecretOutput
                    secret={result?.ok === true ? result.formatted : null}
                    stale={pending}
                    copied={copied === "secret"}
                    spinToken={spinToken}
                    onCopy={() => {
                        if (result?.ok === true) {
                            void handleCopy("secret", result.formatted);
                        }
                    }}
                    onRegenerate={handleRegenerate}
                />

                {/* Says what changed, never the value: a secret read aloud is a
                    secret overheard. */}
                <p role="status" className="sr-only">
                    {result?.ok === true
                        ? t("announcement", {
                              bytes: result.byteLength,
                              bits: result.entropyBits,
                              grade: tGrades(result.grade),
                          })
                        : ""}
                </p>

                {result?.ok === true && (
                    <dl
                        aria-label={t("statsLabel")}
                        className={cn(
                            "grid grid-cols-2 gap-2 transition-opacity duration-200 sm:grid-cols-4",
                            pending && "opacity-55",
                        )}
                    >
                        <Stat
                            label={t("stats.entropy")}
                            value={t("bits", { value: formatter.number(result.entropyBits) })}
                        />
                        <Stat
                            label={t("stats.bytes")}
                            value={formatter.number(result.byteLength)}
                        />
                        <Stat
                            label={t("stats.characters")}
                            value={formatter.number(result.characterCount)}
                        />
                        <Stat label={t("stats.grade")} value={tGrades(result.grade)} />
                    </dl>
                )}

                {result?.ok === true && result.uses.length > 0 && (
                    <p className="text-muted-foreground text-xs leading-normal">
                        {t("usesLabel")}{" "}
                        <span className="text-foreground font-mono">
                            {result.uses.map((use) => SECRET_KEY_USE_LABELS[use]).join(", ")}
                        </span>
                    </p>
                )}

                <Separator />

                <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={byteInputId} className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t("byteLabel")}</span>
                    </Label>
                    <NumberStepper
                        value={byteInput}
                        numeric={options.byteLength}
                        min={MIN_SECRET_BYTES}
                        max={MAX_SECRET_BYTES}
                        presets={SECRET_BYTE_PRESETS}
                        invalid={byteInvalid}
                        inputId={byteInputId}
                        describedById={byteHintId}
                        hint={
                            byteInvalid
                                ? tErrors("byteRange", {
                                      min: MIN_SECRET_BYTES,
                                      max: MAX_SECRET_BYTES,
                                  })
                                : t("byteHint", {
                                      min: MIN_SECRET_BYTES,
                                      max: MAX_SECRET_BYTES,
                                  })
                        }
                        presetsLabel={t("bytePresets")}
                        decreaseLabel={t("decrease")}
                        increaseLabel={t("increase")}
                        onChange={(raw) => applyByteLength(raw, false)}
                        onPreset={(preset) => applyByteLength(String(preset), true)}
                        onStep={handleStep}
                    />
                </div>

                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <OptionSelect<SecretEncoding>
                        label={t("encodingLabel")}
                        hint={tEncodings(`${options.encoding}.hint`)}
                        value={options.encoding}
                        items={Object.fromEntries(
                            SECRET_ENCODINGS.map((encoding) => [
                                encoding,
                                SECRET_ENCODING_LABELS[encoding],
                            ]),
                        )}
                        values={SECRET_ENCODINGS}
                        // Respells the bytes already drawn. Never a new secret.
                        onChange={(encoding) => setOptions((current) => ({ ...current, encoding }))}
                    />

                    <OptionSwitch
                        label={t("paddingLabel")}
                        hint={paddingAvailable ? t("paddingHint") : t("paddingUnavailable")}
                        checked={paddingAvailable && options.padded}
                        disabled={!paddingAvailable}
                        onCheckedChange={(padded) =>
                            setOptions((current) => ({ ...current, padded }))
                        }
                    />
                </div>

                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <OptionSelect<SecretShape>
                        label={t("shapeLabel")}
                        hint={tShapes(`${options.shape}.hint`)}
                        value={options.shape}
                        items={Object.fromEntries(
                            SECRET_SHAPES.map((shape) => [shape, tShapes(`${shape}.label`)]),
                        )}
                        values={SECRET_SHAPES}
                        onChange={(shape) => setOptions((current) => ({ ...current, shape }))}
                    />

                    <div
                        className={cn(
                            "flex min-w-0 flex-col gap-1.5 transition-opacity duration-200",
                            !nameAvailable && "opacity-55",
                        )}
                    >
                        <Label htmlFor={nameInputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("nameLabel")}</span>
                        </Label>
                        <Input
                            id={nameInputId}
                            value={options.variableName}
                            disabled={!nameAvailable}
                            // A short identity field, so the cap is the control
                            // rather than a meter: one character over is a
                            // mistake, and refusing the keystroke costs nothing.
                            maxLength={MAX_VARIABLE_NAME_LENGTH}
                            spellCheck={false}
                            autoCapitalize="off"
                            autoComplete="off"
                            aria-invalid={nameInvalid}
                            aria-describedby={nameHintId}
                            // No debounce: the name is not derived from anything
                            // and re-rendering one line of text per keystroke
                            // costs nothing, while a lagging field would revert
                            // what was just typed.
                            onChange={(event) =>
                                setOptions((current) => ({
                                    ...current,
                                    variableName: sanitizeVariableName(event.target.value),
                                }))
                            }
                            className="font-mono"
                        />
                        {nameInvalid ? (
                            <StatusStrip
                                id={nameHintId}
                                tone="error"
                                message={tErrors("variableName")}
                            />
                        ) : (
                            <p
                                id={nameHintId}
                                className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                            >
                                {nameAvailable ? t("nameHint") : t("nameUnavailable")}
                            </p>
                        )}
                    </div>
                </div>

                <Separator />

                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-muted-foreground/85 text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                            {t("commandLabel")}
                        </p>
                        {result?.ok === true && (
                            <IconCopyButton
                                copied={copied === "command"}
                                aria-label={t("copyCommand")}
                                onClick={() => void handleCopy("command", result.command)}
                            />
                        )}
                    </div>

                    <CodeBlock
                        code={result?.ok === true ? result.command : ""}
                        language="shell"
                        placeholder={t("commandPlaceholder")}
                        pending={pending}
                    />

                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {options.encoding === "base32" ? t("commandBase32Note") : t("commandNote")}
                    </p>
                </div>
            </CardContent>
        </Card>
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
