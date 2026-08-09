"use client";

import { IconArrowsUpDown, IconRotate2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import type { StatusTone } from "@/modules/tools/components/status-strip";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveBlob, saveFile } from "@/modules/tools/domain/file-saver";
import {
    PAYLOAD_BINARY_ENCODINGS,
    PAYLOAD_TEXT_ENCODINGS,
    type CipherBytes,
} from "@/modules/tools/types";
import {
    DEFAULT_GCM_TAG_LENGTH,
    MAX_AES_INPUT_BYTES,
    MAX_AES_INPUT_LENGTH,
    MAX_AES_SECRET_LENGTH,
    MAX_GCM_NONCE_BYTES,
    MAX_PBKDF2_ITERATIONS,
    MAX_SALT_BYTES,
    MIN_PBKDF2_ITERATIONS,
} from "../domain/constants";
import { runAes, supportsPlaintextEncoding } from "../domain/crypt";
import {
    aesKeyCacheKey,
    isAesKeySize,
    readSaltBytes,
    resolveAesKey,
    usesKeyDerivation,
} from "../domain/key";
import { CIPHER_ENCODING_LABELS, MODE_LABELS, TEXT_ENCODING_LABELS } from "../domain/labels";
import { acceptsVariableIv, isAuthenticated, isValidIvHex, ivBytesFor } from "../domain/modes";
import { createAesBlobDownload, createAesExportFile } from "../domain/export";
import { generateKeyMaterial } from "../domain/generate";
import { isBinaryEncoding, isTextEncoding } from "@/modules/tools/domain/payload-codec";
import { randomHex, randomIvHex, randomSaltHex, redrawIvHex } from "../domain/params";
import {
    AES_KEY_SIZES,
    AES_MODES,
    type AesDirection,
    type AesKeyInput,
    type AesKeyResult,
    type AesKeySource,
    type AesMode,
    type AesOptions,
    type AesResult,
    type AesSource,
} from "../types";
import { AdvancedSettings, type HexTarget } from "./advanced-settings";
import { DirectionSelector } from "./direction-selector";
import { KeyPanel } from "./key-panel";
import { OutputPanel } from "./output-panel";
import { PayloadPanel, type LoadedFile } from "./payload-panel";

type CopyTarget = "output" | "key" | HexTarget;

/**
 * How many derived keys are kept. One per passphrase, salt, iteration count and
 * key width the reader has tried this session — a handful in practice, and the
 * whole map is dropped rather than evicted one by one when it fills.
 */
const KEY_CACHE_LIMIT = 32;

type AesWorkbenchProps = {
    initialDirection: AesDirection;
    /**
     * Includes the salt and the IV, both drawn on the server. Drawing them in a
     * `useState` initialiser would give the server pass and the client
     * different bytes, and hydration would break on the first paint.
     */
    initialOptions: AesOptions;
};

export function AesWorkbench({ initialDirection, initialOptions }: AesWorkbenchProps) {
    const t = useTranslations("aes.workbench");
    const tErrors = useTranslations("aes.errors");
    const tToast = useTranslations("aes.toast");

    const directionLabelId = useId();

    const [direction, setDirection] = useState<AesDirection>(initialDirection);
    const [input, setInput] = useState("");
    const [file, setFile] = useState<LoadedFile | null>(null);
    const [secret, setSecret] = useState("");
    const [options, setOptions] = useState<AesOptions>(initialOptions);
    /**
     * What Reset last restored, which is what "unchanged" is measured against.
     * It is not `initialOptions`, because resetting draws a fresh salt and IV —
     * so a workbench that has just been reset would otherwise read as changed
     * for ever afterwards.
     */
    const [baseline, setBaseline] = useState<AesOptions>(initialOptions);
    const [keyRevealed, setKeyRevealed] = useState(false);
    const [copied, setCopied] = useCopyFeedback<CopyTarget>();
    const [computed, setComputed] = useState<{ key: string; result: AesResult } | null>(null);

    /**
     * PBKDF2 at six hundred thousand rounds is most of a second. Without this,
     * every settled keystroke in the payload box would pay for it again, even
     * though nothing the derivation reads had changed.
     */
    const keyCache = useRef(new Map<string, CipherBytes>());

    const resolveKey = useCallback(async (keyInput: AesKeyInput): Promise<AesKeyResult> => {
        const cacheKey = aesKeyCacheKey(keyInput);
        const cached = keyCache.current.get(cacheKey);

        if (cached !== undefined) {
            return { ok: true, bytes: cached };
        }

        const resolved = await resolveAesKey(keyInput);

        if (resolved.ok) {
            if (keyCache.current.size >= KEY_CACHE_LIMIT) {
                keyCache.current.clear();
            }

            keyCache.current.set(cacheKey, resolved.bytes);
        }

        return resolved;
    }, []);

    // Typed values settle first; every other control here is discrete and
    // applies at once. A file arrives as one event, so it does not wait.
    const settledInput = useDebouncedValue(input);
    const settledSecret = useDebouncedValue(secret);
    const pending = settledInput !== input || settledSecret !== secret;

    // Memoised for its identity rather than its cost: it is an effect
    // dependency, and a fresh object each render would re-run the cipher on
    // every render forever.
    const source: AesSource = useMemo(
        () =>
            file === null
                ? { kind: "text", text: settledInput }
                : { kind: "file", name: file.name, bytes: file.bytes },
        [file, settledInput],
    );

    // The file's identity is enough for the key: its bytes cannot change under
    // a name without a fresh pick, and hashing a megabyte per render would not.
    const runKey = JSON.stringify([
        direction,
        file === null ? settledInput : [file.name, file.bytes.length],
        settledSecret,
        options,
    ]);

    useEffect(() => {
        let cancelled = false;

        void runAes({ direction, source, secret: settledSecret, options }, resolveKey).then(
            (result) => {
                if (!cancelled) {
                    setComputed({ key: runKey, result });
                }
            },
        );

        return () => {
            cancelled = true;
        };
    }, [runKey, direction, source, settledSecret, options, resolveKey]);

    // A result from an earlier keystroke is discarded rather than shown: the
    // panel dims and says it is working instead of asserting a stale value.
    const result = computed?.key === runKey ? computed.result : null;
    const output = result?.ok === true ? result.output : "";

    function describeFailure(failure: Extract<AesResult, { ok: false }>): string {
        switch (failure.reason) {
            case "too_large":
                return tErrors("too_large", { limit: MAX_AES_INPUT_LENGTH });
            case "key_too_large":
                return tErrors("key_too_large", { limit: MAX_AES_SECRET_LENGTH });
            case "invalid_key_length":
                return tErrors("invalid_key_length", {
                    expected: failure.expectedBytes ?? 0,
                    actual: failure.actualBytes ?? 0,
                });
            case "invalid_iv":
                return acceptsVariableIv(options.mode)
                    ? tErrors("invalid_iv_variable", { max: MAX_GCM_NONCE_BYTES })
                    : tErrors("invalid_iv", { bytes: failure.expectedBytes ?? 0 });
            case "unsupported_iv_length":
                return tErrors("unsupported_iv_length", {
                    bytes: failure.actualBytes ?? 0,
                    recommended: ivBytesFor(options.mode),
                });
            case "invalid_salt":
                return tErrors("invalid_salt", { max: MAX_SALT_BYTES });
            case "invalid_iterations":
                return tErrors("invalid_iterations", {
                    min: MIN_PBKDF2_ITERATIONS,
                    max: MAX_PBKDF2_ITERATIONS,
                });
            case "invalid_input_encoding":
                return tErrors("invalid_input_encoding", {
                    encoding:
                        direction === "encrypt"
                            ? TEXT_ENCODING_LABELS[options.textEncoding]
                            : CIPHER_ENCODING_LABELS[options.cipherEncoding],
                });
            case "ciphertext_too_short":
                return tErrors("ciphertext_too_short", { bytes: failure.expectedBytes ?? 0 });
            case "unsupported_key_size":
                return tErrors("unsupported_key_size", { cipher: `AES-${options.keySize}` });
            default:
                return tErrors(failure.reason);
        }
    }

    const status: { tone: StatusTone; message: string } = (() => {
        if (input.length === 0) {
            return { tone: "idle", message: t("status.awaitingInput") };
        }

        if (result === null) {
            return { tone: "pending", message: t(`status.working.${direction}`) };
        }

        return result.ok
            ? {
                  tone: "success",
                  // The algorithm name is a proper name, not a number that
                  // reads as prose, so it is built here rather than formatted.
                  message: t(`status.done.${direction}`, {
                      cipher: `AES-${options.keySize}`,
                      mode: MODE_LABELS[options.mode],
                  }),
              }
            : { tone: "error", message: describeFailure(result) };
    })();

    /**
     * The one thing this page must not let a reader assume. CBC and CTR decrypt
     * altered ciphertext without complaint, and only GCM will tell you.
     */
    const notice: { tone: StatusTone; message: string } = (() => {
        if (!isAuthenticated(options.mode)) {
            return { tone: "warning", message: t("notices.unauthenticated") };
        }

        // A truncated tag is exactly as many bits of forgery resistance as it
        // is long, so a reader who shortens it should be told what they spent.
        return options.tagLength < DEFAULT_GCM_TAG_LENGTH
            ? { tone: "warning", message: t("notices.shortTag", { bits: options.tagLength }) }
            : { tone: "success", message: t("notices.authenticated") };
    })();

    /**
     * Every setting, in a fixed order, with the two random ones left out — they
     * are noise the reader did not choose, and Reset redraws them anyway.
     * Written out rather than destructured so adding a ninth option is a
     * compile-time decision instead of a silent omission.
     */
    function comparableSettings(candidate: AesOptions): string {
        return JSON.stringify([
            candidate.mode,
            candidate.keySize,
            candidate.keySource,
            candidate.tagLength,
            candidate.iterations,
            candidate.textEncoding,
            candidate.cipherEncoding,
        ]);
    }

    const pristine =
        input.length === 0 &&
        secret.length === 0 &&
        file === null &&
        direction === initialDirection &&
        options.saltHex === baseline.saltHex &&
        options.ivHex === baseline.ivHex &&
        comparableSettings(options) === comparableSettings(baseline);

    function updateOptions(patch: Partial<AesOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    function handleModeChange(mode: AesMode) {
        // A block IV is not a GCM nonce. Carrying one across would leave the
        // field holding a value the next operation refuses, so it is redrawn
        // whenever the width changes — in a handler, never during render.
        const widthChanged = ivBytesFor(mode) !== ivBytesFor(options.mode);

        updateOptions(widthChanged ? { mode, ivHex: randomIvHex(mode) } : { mode });
    }

    /**
     * Draws a secret in whichever form the field is currently reading, and
     * reveals it — a key you cannot see is no use for pasting into the system
     * that has to share it. A discrete press, so nothing here is debounced.
     */
    function handleGenerateKey() {
        setSecret(generateKeyMaterial(options.keySource, options.keySize));
        setKeyRevealed(true);
        toast.success(tToast(`keyGenerated.${options.keySource}`));
    }

    /**
     * The picker is a generator: choosing a width draws a nonce at it rather
     * than trying to stretch or trim the one already there. Trimming would
     * produce a value the reader never chose, under a control that said it was
     * only changing the length.
     */
    function handleNonceWidthChange(bytes: number) {
        updateOptions({ ivHex: randomHex(bytes) });
        toast.success(tToast("ivRegenerated"));
    }

    function handleRegenerate(target: HexTarget) {
        if (target === "salt") {
            updateOptions({ saltHex: randomSaltHex() });
            toast.success(tToast("saltRegenerated"));

            return;
        }

        // At the width already in the field, not the mode's default — see
        // `redrawIvHex`.
        updateOptions({ ivHex: redrawIvHex(options.mode, options.ivHex) });
        toast.success(tToast("ivRegenerated"));
    }

    function handleClear() {
        setInput("");
        setFile(null);
    }

    async function handleFileSelect(selected: File) {
        if (selected.size > MAX_AES_INPUT_BYTES) {
            toast.error(
                tErrors("fileTooLarge", { name: selected.name, limit: MAX_AES_INPUT_BYTES }),
            );

            return;
        }

        try {
            const buffer = await selected.arrayBuffer();

            setFile({ name: selected.name, bytes: new Uint8Array(buffer) });
            setInput("");
            toast.success(tToast("fileLoaded", { name: selected.name }));
        } catch (caught) {
            logEvent("error", "aes.file_read_failed", { error: describeError(caught) });
            toast.error(tErrors("fileUnreadable"));
        }
    }

    /**
     * Everything back to how the page opened, and nothing left behind.
     *
     * Back to how it *opened* rather than to the built-in defaults, because a
     * link carrying `?mode=cbc&keySize=128` asked for those and discarding them
     * would make the reader read the link again. The salt and the IV are the
     * exception: they are redrawn rather than restored, since starting over
     * with the initialisation vector you may already have encrypted under is
     * the one thing this tool warns about most loudly.
     *
     * The derived-key cache goes too. It holds real key material, and "restart
     * everything" that quietly kept it would not be that.
     */
    function handleReset() {
        const fresh: AesOptions = {
            ...initialOptions,
            saltHex: randomSaltHex(),
            ivHex: randomIvHex(initialOptions.mode),
        };

        keyCache.current.clear();

        setDirection(initialDirection);
        setInput("");
        setFile(null);
        setSecret("");
        setKeyRevealed(false);
        setComputed(null);
        setOptions(fresh);
        setBaseline(fresh);

        toast.success(tToast("reset"));
    }

    /** Feeds the result back in, so encrypt → decrypt is one press. */
    function handleSwap() {
        if (output.length === 0) {
            return;
        }

        setInput(output);
        setFile(null);
        setDirection(direction === "encrypt" ? "decrypt" : "encrypt");
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

    /** Exhaustive rather than nested ternaries, so a fifth target cannot be missed. */
    function valueFor(target: CopyTarget): string {
        switch (target) {
            case "output":
                return output;
            case "key":
                return secret;
            case "salt":
                return options.saltHex;
            case "iv":
                return options.ivHex;
        }
    }

    async function handleCopy(target: CopyTarget) {
        const result = await copyText(valueFor(target));

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        setCopied(target);
        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const exported = createAesExportFile({
            direction,
            content: output,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "aes.download_failed", { direction, error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    /** The plaintext as the bytes it is, which is what closes a file's loop. */
    function handleDownloadBytes() {
        if (result?.ok !== true) {
            return;
        }

        const download = createAesBlobDownload({
            direction,
            bytes: result.bytes,
            generatedAt: new Date(),
        });

        try {
            saveBlob(download);
            toast.success(tToast("downloaded", { filename: download.filename }));
        } catch (caught) {
            logEvent("error", "aes.download_failed", { direction, error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const modeItems: Record<string, ReactNode> = { ...MODE_LABELS };
    const keySizeItems: Record<string, ReactNode> = Object.fromEntries(
        AES_KEY_SIZES.map((size) => [String(size), t("keySizeOption", { bits: size })]),
    );

    const textEncodingItems: Record<string, ReactNode> = { ...TEXT_ENCODING_LABELS };
    const cipherEncodingItems: Record<string, ReactNode> = { ...CIPHER_ENCODING_LABELS };
    const encrypting = direction === "encrypt";

    function handleInputEncodingChange(next: string) {
        if (encrypting) {
            if (isTextEncoding(next)) {
                updateOptions({ textEncoding: next });
            }

            return;
        }

        if (isBinaryEncoding(next)) {
            updateOptions({ cipherEncoding: next });
        }
    }

    function handleOutputEncodingChange(next: string) {
        if (encrypting) {
            if (isBinaryEncoding(next)) {
                updateOptions({ cipherEncoding: next });
            }

            return;
        }

        if (isTextEncoding(next)) {
            updateOptions({ textEncoding: next });
        }
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
                <CardAction>
                    {/* Quiet until there is something to undo, so it never
                        reads as a button that might do nothing. */}
                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={pristine}
                        title={t("resetHint")}
                        className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-7 px-2 text-[0.6875rem]",
                        )}
                    >
                        <IconRotate2 className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("reset")}
                    </button>
                </CardAction>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <p className="text-muted-foreground max-w-2xl text-[0.8125rem] leading-normal">
                    {t("secretsNotice")}
                </p>

                <div className="flex flex-col gap-2">
                    <Label id={directionLabelId} className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t("directionLabel")}</span>
                    </Label>
                    <DirectionSelector
                        value={direction}
                        onChange={setDirection}
                        labelId={directionLabelId}
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <OptionSelect
                        label={t("modeLabel")}
                        hint={t(`modeHint.${options.mode}`)}
                        value={options.mode}
                        items={modeItems}
                        values={AES_MODES}
                        onChange={handleModeChange}
                    />
                    <OptionSelect
                        label={t("keySizeLabel")}
                        hint={t("keySizeHint")}
                        value={String(options.keySize)}
                        items={keySizeItems}
                        values={AES_KEY_SIZES.map(String)}
                        onChange={(next) => {
                            const size = Number(next);

                            if (isAesKeySize(size)) {
                                updateOptions({ keySize: size });
                            }
                        }}
                    />
                </div>

                <KeyPanel
                    source={options.keySource}
                    keySize={options.keySize}
                    value={secret}
                    revealed={keyRevealed}
                    copied={copied === "key"}
                    onRevealedChange={setKeyRevealed}
                    onSourceChange={(keySource: AesKeySource) => updateOptions({ keySource })}
                    onValueChange={setSecret}
                    onGenerate={handleGenerateKey}
                    onCopy={() => void handleCopy("key")}
                />

                <PayloadPanel
                    direction={direction}
                    value={input}
                    file={file}
                    encoding={encrypting ? options.textEncoding : options.cipherEncoding}
                    encodingItems={encrypting ? textEncodingItems : cipherEncodingItems}
                    encodingValues={encrypting ? PAYLOAD_TEXT_ENCODINGS : PAYLOAD_BINARY_ENCODINGS}
                    encodingApplies={
                        encrypting ? supportsPlaintextEncoding(direction, source) : true
                    }
                    onEncodingChange={handleInputEncodingChange}
                    onChange={setInput}
                    onFileSelect={(selected) => void handleFileSelect(selected)}
                    onClear={handleClear}
                />

                <AdvancedSettings
                    options={options}
                    copied={copied === "salt" || copied === "iv" ? copied : null}
                    saltInvalid={
                        usesKeyDerivation(options.keySource) &&
                        readSaltBytes(options.saltHex) === null
                    }
                    ivInvalid={!isValidIvHex(options.mode, options.ivHex)}
                    onChange={updateOptions}
                    onRegenerate={handleRegenerate}
                    onCopy={(target) => void handleCopy(target)}
                    onNonceWidthChange={handleNonceWidthChange}
                />

                <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <button
                                    type="button"
                                    onClick={handleSwap}
                                    disabled={output.length === 0}
                                    aria-label={t("swap")}
                                    className={cn(
                                        buttonVariants({ variant: "outline", size: "icon-sm" }),
                                        "rounded-full",
                                    )}
                                />
                            }
                        >
                            <IconArrowsUpDown className="size-4" stroke={1.8} aria-hidden="true" />
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("swap")}</TooltipContent>
                    </Tooltip>
                    <Separator className="flex-1" />
                </div>

                <OutputPanel
                    direction={direction}
                    output={output}
                    encoding={encrypting ? options.cipherEncoding : options.textEncoding}
                    encodingItems={encrypting ? cipherEncodingItems : textEncodingItems}
                    encodingValues={encrypting ? PAYLOAD_BINARY_ENCODINGS : PAYLOAD_TEXT_ENCODINGS}
                    onEncodingChange={handleOutputEncodingChange}
                    status={status}
                    notice={notice}
                    pending={pending || result === null}
                    copied={copied === "output"}
                    onCopy={() => void handleCopy("output")}
                    onDownload={handleDownload}
                    onDownloadBytes={encrypting ? null : handleDownloadBytes}
                />
            </CardContent>
        </Card>
    );
}
