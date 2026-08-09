"use client";

import { IconArrowDown, IconRotate2 } from "@tabler/icons-react";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import type { StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveBlob, saveFile } from "@/modules/tools/domain/file-saver";
import { isBinaryEncoding, isTextEncoding } from "@/modules/tools/domain/payload-codec";
import {
    PAYLOAD_BINARY_ENCODINGS,
    PAYLOAD_TEXT_ENCODINGS,
    type RsaKeyKind,
} from "@/modules/tools/types";
import {
    KEY_INPUT_FORMAT_LABELS,
    MAX_RSA_CRYPT_INPUT_BYTES,
    MAX_RSA_KEY_LENGTH,
    PADDING_LABELS,
} from "../domain/constants";
import { runRsaCrypt, supportsPlaintextEncoding } from "../domain/crypt";
import { createRsaCryptBlobDownload, createRsaCryptExportFile } from "../domain/export";
import { importRsaCryptKey } from "../domain/import-key";
import { maxOaepMessageBytes, minModulusBitsFor } from "../domain/limits";
import {
    isKeyInputFormat,
    isRsaCryptHash,
    keyKindApplies,
    requiredKeyKind,
} from "../domain/options";
import {
    RSA_CRYPT_HASHES,
    RSA_KEY_INPUT_FORMATS,
    RSA_PADDINGS,
    type RsaCryptDirection,
    type RsaCryptOptions,
    type RsaCryptResult,
    type RsaCryptSource,
    type RsaKeyImportResult,
} from "../types";
import { DirectionSelector } from "./direction-selector";
import { KeyInputPanel } from "./key-input-panel";
import { KeyKindToggle } from "./key-kind-toggle";
import { OutputPanel } from "./output-panel";
import { PayloadPanel, type LoadedFile } from "./payload-panel";

type CopyTarget = "output";

/**
 * How many imported keys are kept. One per key, format, kind and hash the reader
 * has tried this session — a handful in practice, and the whole map is dropped
 * rather than evicted one by one when it fills.
 */
const KEY_CACHE_LIMIT = 16;

type RsaCryptWorkbenchProps = {
    initialDirection: RsaCryptDirection;
    /**
     * How the page opened, which is also what Reset restores. Nothing here is
     * drawn at random and nothing is read from the host, so these are plain
     * defaults rather than server-generated values.
     */
    initialOptions: RsaCryptOptions;
};

export function RsaCryptWorkbench({ initialDirection, initialOptions }: RsaCryptWorkbenchProps) {
    const t = useTranslations("rsaEncrypt.workbench");
    const tErrors = useTranslations("rsaEncrypt.errors");
    const tToast = useTranslations("rsaEncrypt.toast");

    const directionLabelId = useId();

    const [direction, setDirection] = useState<RsaCryptDirection>(initialDirection);
    const [input, setInput] = useState("");
    const [file, setFile] = useState<LoadedFile | null>(null);
    const [keyText, setKeyText] = useState("");
    const [options, setOptions] = useState<RsaCryptOptions>(initialOptions);
    const [copied, setCopied] = useCopyFeedback<CopyTarget>();
    const [computed, setComputed] = useState<{ key: string; result: RsaCryptResult } | null>(null);
    /** The modulus of whichever key last imported, for the size hint. */
    const [modulusBits, setModulusBits] = useState<number | null>(null);

    /**
     * Importing a 4096-bit key is not free, and without this it would happen
     * again on every settled keystroke in the payload box even though nothing
     * the import reads had changed.
     */
    const keyCache = useRef(new Map<string, RsaKeyImportResult>());

    const importKey = useCallback(
        async (text: string, current: RsaCryptOptions, want: RsaKeyKind) => {
            const cacheKey = JSON.stringify([
                text,
                current.keyFormat,
                current.keyKind,
                want,
                current.hash,
            ]);
            const cached = keyCache.current.get(cacheKey);

            if (cached !== undefined) {
                return cached;
            }

            const resolved = await importRsaCryptKey({
                text,
                format: current.keyFormat,
                kind: current.keyKind,
                want,
                hash: current.hash,
            });

            if (keyCache.current.size >= KEY_CACHE_LIMIT) {
                keyCache.current.clear();
            }

            keyCache.current.set(cacheKey, resolved);

            return resolved;
        },
        [],
    );

    // Typed values settle first; every other control here is discrete and
    // applies at once. A file arrives as one event, so it does not wait.
    const settledInput = useDebouncedValue(input);
    const settledKey = useDebouncedValue(keyText);
    const pending = settledInput !== input || settledKey !== keyText;

    // Memoised for its identity rather than its cost: it is an effect
    // dependency, and a fresh object each render would re-run the cipher on
    // every render forever.
    const source: RsaCryptSource = useMemo(
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
        settledKey,
        options,
    ]);

    useEffect(() => {
        let cancelled = false;

        void runRsaCrypt(
            { direction, source, keyText: settledKey, options },
            (text, current, want) => importKey(text, current, want),
        ).then((result) => {
            if (cancelled) {
                return;
            }

            setComputed({ key: runKey, result });
            setModulusBits(result.ok ? result.modulusBits : null);
        });

        return () => {
            cancelled = true;
        };
    }, [runKey, direction, source, settledKey, options, importKey]);

    // A result from an earlier keystroke is discarded rather than shown: the
    // panel dims and says it is working instead of asserting a stale value.
    const result = computed?.key === runKey ? computed.result : null;
    const output = result?.ok === true ? result.output : "";

    /**
     * How much OAEP will take under the key currently in the box.
     *
     * `null` until a key has imported, because the ceiling is a property of the
     * modulus and quoting a number before there is one to read would be a guess.
     */
    const messageLimit =
        modulusBits === null ? null : maxOaepMessageBytes(modulusBits, options.hash);

    function describeFailure(failure: Extract<RsaCryptResult, { ok: false }>): string {
        switch (failure.reason) {
            case "wrong_key_kind":
                return tErrors(`wrong_key_kind.${failure.foundKind ?? "public"}`);
            case "message_too_long":
                return tErrors("message_too_long", {
                    limit: failure.limitBytes ?? 0,
                    actual: failure.actualBytes ?? 0,
                });
            case "hash_too_large_for_key":
                return tErrors("hash_too_large_for_key", {
                    hash: options.hash,
                    bits: modulusBits ?? 0,
                    needed: minModulusBitsFor(options.hash),
                });
            case "invalid_input_encoding":
                return tErrors("invalid_input_encoding", {
                    encoding:
                        direction === "encrypt" ? options.textEncoding : options.cipherEncoding,
                });
            case "unreadable_key":
                return tErrors("unreadable_key", {
                    format: KEY_INPUT_FORMAT_LABELS[options.keyFormat],
                });
            default:
                return tErrors(failure.reason);
        }
    }

    const status: { tone: StatusTone; message: string } = (() => {
        if (keyText.length === 0) {
            return { tone: "idle", message: t("status.awaitingKey") };
        }

        if (input.length === 0 && file === null) {
            return { tone: "idle", message: t("status.awaitingInput") };
        }

        if (result === null) {
            return { tone: "pending", message: t(`status.working.${direction}`) };
        }

        return result.ok
            ? {
                  tone: "success",
                  message: t(`status.done.${direction}`, {
                      bits: result.modulusBits,
                      hash: options.hash,
                  }),
              }
            : { tone: "error", message: describeFailure(result) };
    })();

    /**
     * The two things about RSA that surprise people, said where the answer is.
     *
     * It is not a bulk cipher, and its ciphertext is always one modulus wide
     * whatever went in — so a reader watching five bytes become 256 is told why
     * rather than left wondering.
     */
    const notice: { tone: StatusTone; message: string } = (() => {
        if (direction === "decrypt") {
            return { tone: "success", message: t("notices.authenticated") };
        }

        return messageLimit === null
            ? { tone: "warning", message: t("notices.notBulk") }
            : { tone: "warning", message: t("notices.blockSize", { bytes: messageLimit }) };
    })();

    const pristine =
        input.length === 0 &&
        keyText.length === 0 &&
        file === null &&
        direction === initialDirection &&
        JSON.stringify(options) === JSON.stringify(initialOptions);

    function updateOptions(patch: Partial<RsaCryptOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    /**
     * Switching direction switches which half of the pair is needed, so the Key
     * Type toggle is moved with it rather than left pointing at a key that
     * cannot work. Under Decrypt there is only one legal answer.
     */
    function handleDirectionChange(next: RsaCryptDirection) {
        setDirection(next);
        updateOptions({ keyKind: requiredKeyKind(next, options.keyKind) });
    }

    /**
     * Everything back to how the page opened, and nothing left behind.
     *
     * The import cache goes too. It holds imported private keys, and "reset
     * everything" that quietly kept them would not be that.
     */
    function handleReset() {
        keyCache.current.clear();

        setDirection(initialDirection);
        setInput("");
        setFile(null);
        setKeyText("");
        setOptions(initialOptions);
        setComputed(null);
        setModulusBits(null);

        toast.success(tToast("reset"));
    }

    function handleClear() {
        setInput("");
        setFile(null);
    }

    async function readFile(
        selected: File,
        limit: number,
    ): Promise<Uint8Array<ArrayBuffer> | null> {
        if (selected.size > limit) {
            toast.error(tErrors("fileTooLarge", { name: selected.name, limit }));

            return null;
        }

        try {
            return new Uint8Array(await selected.arrayBuffer());
        } catch (caught) {
            logEvent("error", "rsa_encrypt.file_read_failed", { error: describeError(caught) });
            toast.error(tErrors("fileUnreadable"));

            return null;
        }
    }

    async function handleFileSelect(selected: File) {
        const bytes = await readFile(selected, MAX_RSA_CRYPT_INPUT_BYTES);

        if (bytes === null) {
            return;
        }

        setFile({ name: selected.name, bytes });
        setInput("");
        toast.success(tToast("fileLoaded", { name: selected.name }));
    }

    /** A key file is read as text — every container this tool takes is text. */
    async function handleKeyFileSelect(selected: File) {
        const bytes = await readFile(selected, MAX_RSA_KEY_LENGTH);

        if (bytes === null) {
            return;
        }

        setKeyText(new TextDecoder().decode(bytes));
        toast.success(tToast("keyLoaded", { name: selected.name }));
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

    async function handleCopy() {
        const copiedResult = await copyText(output);

        if (!copiedResult.ok) {
            reportCopyFailure(copiedResult);

            return;
        }

        setCopied("output");
        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const exported = createRsaCryptExportFile({
            direction,
            content: output,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "rsa_encrypt.download_failed", {
                direction,
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    /** The plaintext as the bytes it is, which is what closes a file's loop. */
    function handleDownloadBytes() {
        if (result?.ok !== true) {
            return;
        }

        const download = createRsaCryptBlobDownload({
            direction,
            bytes: result.bytes,
            generatedAt: new Date(),
        });

        try {
            saveBlob(download);
            toast.success(tToast("downloaded", { filename: download.filename }));
        } catch (caught) {
            logEvent("error", "rsa_encrypt.download_failed", {
                direction,
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    const encrypting = direction === "encrypt";

    const keyFormatItems: Record<string, ReactNode> = { ...KEY_INPUT_FORMAT_LABELS };
    const paddingItems: Record<string, ReactNode> = { ...PADDING_LABELS };
    const hashItems: Record<string, ReactNode> = Object.fromEntries(
        RSA_CRYPT_HASHES.map((hash) => [hash, hash]),
    );
    const textEncodingItems: Record<string, ReactNode> = Object.fromEntries(
        PAYLOAD_TEXT_ENCODINGS.map((encoding) => [encoding, encoding.toUpperCase()]),
    );
    const binaryEncodingItems: Record<string, ReactNode> = Object.fromEntries(
        PAYLOAD_BINARY_ENCODINGS.map((encoding) => [
            encoding,
            encoding === "hex" ? "Hex" : "Base64",
        ]),
    );

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
                    {t("localNotice")}
                </p>

                <div className="flex flex-col gap-2">
                    <Label id={directionLabelId} className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t("directionLabel")}</span>
                    </Label>
                    <DirectionSelector
                        value={direction}
                        onChange={handleDirectionChange}
                        labelId={directionLabelId}
                    />
                </div>

                <div className="grid items-start gap-4 sm:grid-cols-2">
                    <OptionSelect
                        label={t("keyFormatLabel")}
                        hint={t(`keyFormatHint.${options.keyFormat}`)}
                        value={options.keyFormat}
                        items={keyFormatItems}
                        values={RSA_KEY_INPUT_FORMATS}
                        onChange={(next) => {
                            if (isKeyInputFormat(next)) {
                                updateOptions({ keyFormat: next });
                            }
                        }}
                    />

                    <KeyKindToggle
                        value={options.keyKind}
                        enabled={keyKindApplies(direction)}
                        onChange={(keyKind: RsaKeyKind) => updateOptions({ keyKind })}
                    />
                </div>

                <div className="grid items-start gap-4 sm:grid-cols-2">
                    {/* One option, and it stays a picker rather than becoming a
                        label: the answer to "which padding is this?" belongs on
                        screen, and the hint is where the absent one is named. */}
                    <OptionSelect
                        label={t("paddingLabel")}
                        hint={t("paddingHint")}
                        value={options.padding}
                        items={paddingItems}
                        values={RSA_PADDINGS}
                        onChange={() => undefined}
                    />

                    <OptionSelect
                        label={t("hashLabel")}
                        hint={t("hashHint")}
                        value={options.hash}
                        items={hashItems}
                        values={RSA_CRYPT_HASHES}
                        onChange={(next) => {
                            if (isRsaCryptHash(next)) {
                                updateOptions({ hash: next });
                            }
                        }}
                    />
                </div>

                <KeyInputPanel
                    value={keyText}
                    kind={options.keyKind}
                    format={options.keyFormat}
                    onChange={setKeyText}
                    onFileSelect={(selected) => void handleKeyFileSelect(selected)}
                    onClear={() => setKeyText("")}
                />

                <PayloadPanel
                    direction={direction}
                    value={input}
                    file={file}
                    encoding={encrypting ? options.textEncoding : options.cipherEncoding}
                    encodingItems={encrypting ? textEncodingItems : binaryEncodingItems}
                    encodingValues={encrypting ? PAYLOAD_TEXT_ENCODINGS : PAYLOAD_BINARY_ENCODINGS}
                    encodingApplies={
                        encrypting ? supportsPlaintextEncoding(direction, source) : true
                    }
                    messageLimit={encrypting ? messageLimit : null}
                    onEncodingChange={handleInputEncodingChange}
                    onChange={setInput}
                    onFileSelect={(selected) => void handleFileSelect(selected)}
                    onClear={handleClear}
                />

                <div className="flex items-center justify-center" aria-hidden="true">
                    <IconArrowDown className="text-muted-foreground size-4" stroke={1.8} />
                </div>

                <OutputPanel
                    direction={direction}
                    output={output}
                    encoding={encrypting ? options.cipherEncoding : options.textEncoding}
                    encodingItems={encrypting ? binaryEncodingItems : textEncodingItems}
                    encodingValues={encrypting ? PAYLOAD_BINARY_ENCODINGS : PAYLOAD_TEXT_ENCODINGS}
                    onEncodingChange={handleOutputEncodingChange}
                    status={status}
                    notice={notice}
                    pending={pending || result === null}
                    copied={copied === "output"}
                    onCopy={() => void handleCopy()}
                    onDownload={handleDownload}
                    onDownloadBytes={encrypting ? null : handleDownloadBytes}
                />
            </CardContent>
        </Card>
    );
}
