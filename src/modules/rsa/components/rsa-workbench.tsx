"use client";

import { IconFileZip, IconKey, IconLoader2, IconRotate2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { ARTICLE_TAGS } from "@/modules/tools/components/article-section";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import {
    OptionsDisclosure,
    RESULT_TRAY,
    StepLabel,
} from "@/modules/tools/components/workbench-step";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveBlob, saveFile } from "@/modules/tools/domain/file-saver";
import {
    KEY_FORMAT_LABELS,
    OUTPUT_FORMAT_LABELS,
    PORTABLE_PUBLIC_EXPONENTS,
    RSA_ALGORITHM_NAMES,
} from "../domain/constants";
import { parsePublicExponent, isPortableExponent } from "../domain/exponent";
import { createRsaKeyFile, createRsaKeyPairArchive } from "../domain/export";
import { generateRsaKeyMaterial, isMaterialStale, renderRsaKeyPair } from "../domain/generate";
import {
    isRsaHash,
    isRsaKeyFormat,
    isRsaKeySize,
    isRsaOutputFormat,
    isRsaUsage,
    isSlowKeySize,
    isWeakKeySize,
    keyFormatApplies,
} from "../domain/options";
import { RSA_KEY_FORMATS, RSA_KEY_KINDS, type RsaKeyKind } from "@/modules/tools/types";
import {
    RSA_HASHES,
    RSA_KEY_SIZES,
    RSA_OUTPUT_FORMATS,
    RSA_USAGES,
    type RsaFailureReason,
    type RsaKeyMaterial,
    type RsaOptions,
} from "../types";
import { AdvancedSettings } from "./advanced-settings";
import { KeyPanel } from "./key-panel";

type CopyTarget = "public" | "private" | "fingerprint";

type RsaWorkbenchProps = {
    /**
     * How the page opened, which is also what Reset restores. Nothing here is
     * drawn at random and nothing is read from the host, so these are plain
     * defaults rather than server-generated values — the first key is minted by
     * the press, in the reader's own tab.
     */
    initialOptions: RsaOptions;
};

export function RsaWorkbench({ initialOptions }: RsaWorkbenchProps) {
    const t = useTranslations("rsa.workbench");
    const tErrors = useTranslations("rsa.errors");
    const tToast = useTranslations("rsa.toast");

    const keySizeLabelId = useId();

    const [options, setOptions] = useState<RsaOptions>(initialOptions);
    const [material, setMaterial] = useState<RsaKeyMaterial | null>(null);
    const [failure, setFailure] = useState<RsaFailureReason | null>(null);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useCopyFeedback<CopyTarget>();

    const { ref: resultRef, scrollToResult } = useResultScroll();

    const exponent = parsePublicExponent(options.publicExponent);
    const exponentInvalid = exponent === null;
    const containerApplies = keyFormatApplies(options.outputFormat);

    // Derived during render from a pure domain function, so switching container
    // or rendering costs nothing and the panels never fall a frame behind.
    const rendered =
        material === null
            ? null
            : renderRsaKeyPair(material, options.keyFormat, options.outputFormat);
    const stale = material !== null && isMaterialStale(material, options);

    function updateOptions(patch: Partial<RsaOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    /**
     * Everything back to how the page opened, and nothing left behind.
     *
     * Back to how it *opened* rather than to the built-in defaults, because a
     * link carrying `?keySize=4096&outputFormat=jwk` asked for those and
     * discarding them would make the reader read the link again. The key
     * material goes unconditionally: "reset everything" that quietly kept a
     * private key in memory would not be that.
     */
    function handleReset() {
        setOptions(initialOptions);
        setMaterial(null);
        setFailure(null);
        toast.success(tToast("reset"));
    }

    async function handleGenerate() {
        if (generating || exponentInvalid) {
            return;
        }

        setGenerating(true);
        setFailure(null);

        try {
            const result = await generateRsaKeyMaterial(options);

            if (!result.ok) {
                setMaterial(null);
                setFailure(result.reason);
                logEvent("warn", "rsa.generation_refused", {
                    reason: result.reason,
                    keySize: options.keySize,
                    usage: options.usage,
                });

                return;
            }

            setMaterial(result.material);
            toast.success(tToast("generated", { bits: result.material.modulusBits }));
            // Only after a key exists. Scrolling to a panel that turned out
            // empty is worse than not scrolling.
            scrollToResult();
        } catch (caught) {
            // `generateRsaKeyMaterial` returns its refusals rather than throwing,
            // so anything landing here is a fault in the page, not in the input.
            setMaterial(null);
            setFailure("generation_failed");
            logEvent("error", "rsa.generation_failed", { error: describeError(caught) });
        } finally {
            setGenerating(false);
        }
    }

    function reportCopyFailure(result: Extract<CopyResult, { ok: false }>) {
        const message =
            result.reason === "empty"
                ? tToast("copyFailedEmpty")
                : result.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    /** Exhaustive rather than nested ternaries, so a fourth target cannot be missed. */
    function valueFor(target: CopyTarget): string {
        switch (target) {
            case "public":
                return rendered?.publicKey.text ?? "";
            case "private":
                return rendered?.privateKey.text ?? "";
            case "fingerprint":
                return material?.fingerprint ?? "";
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

    function handleDownload(kind: RsaKeyKind) {
        if (rendered === null) {
            return;
        }

        const file = createRsaKeyFile({
            kind,
            content: kind === "public" ? rendered.publicKey.text : rendered.privateKey.text,
            outputFormat: options.outputFormat,
            generatedAt: new Date(),
        });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "rsa.download_failed", { kind, error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    /**
     * Both halves in one press, which is how they stay together.
     *
     * A ZIP rather than two saves in a row: a browser blocks the second
     * programmatic download that arrives within a moment of the first, and a
     * reader silently given one key out of two would not find out until the key
     * did not work.
     */
    function handleDownloadBoth() {
        if (rendered === null) {
            return;
        }

        const archive = createRsaKeyPairArchive({
            publicKey: rendered.publicKey.text,
            privateKey: rendered.privateKey.text,
            outputFormat: options.outputFormat,
            generatedAt: new Date(),
        });

        try {
            saveBlob(archive);
            toast.success(tToast("downloaded", { filename: archive.filename }));
        } catch (caught) {
            logEvent("error", "rsa.download_failed", {
                kind: "both",
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    const status: { tone: StatusTone; message: string } = (() => {
        if (generating) {
            return { tone: "pending", message: t("status.working", { bits: options.keySize }) };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure) };
        }

        if (material === null) {
            return { tone: "idle", message: t("status.idle") };
        }

        return stale
            ? { tone: "warning", message: t("status.stale") }
            : {
                  tone: "success",
                  message: t("status.done", {
                      bits: material.modulusBits,
                      // A Web Crypto algorithm name is a proper name, and the
                      // exponent mirrors machine input, so neither goes through
                      // the number formatter.
                      algorithm: RSA_ALGORITHM_NAMES[material.usage],
                      exponent: material.exponent,
                  }),
              };
    })();

    function describeFailure(reason: RsaFailureReason): string {
        if (reason === "unsupported_exponent") {
            return tErrors("unsupported_exponent", {
                values: PORTABLE_PUBLIC_EXPONENTS.join(" · "),
            });
        }

        return tErrors(reason);
    }

    const keySizeItems: Record<string, ReactNode> = Object.fromEntries(
        RSA_KEY_SIZES.map((size) => [String(size), t("keySizeOption", { bits: size })]),
    );
    const usageItems: Record<string, ReactNode> = Object.fromEntries(
        RSA_USAGES.map((usage) => [usage, t(`usageOption.${usage}`)]),
    );
    const hashItems: Record<string, ReactNode> = Object.fromEntries(
        RSA_HASHES.map((hash) => [hash, hash]),
    );
    const keyFormatItems: Record<string, ReactNode> = { ...KEY_FORMAT_LABELS };
    const outputFormatItems: Record<string, ReactNode> = { ...OUTPUT_FORMAT_LABELS };

    const pristine =
        material === null &&
        failure === null &&
        JSON.stringify(options) === JSON.stringify(initialOptions);

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex min-w-0 flex-col gap-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-muted-foreground max-w-2xl min-w-0 flex-1 text-[0.8125rem] leading-normal">
                        {t("saveNotice")}
                    </p>
                    {/* Quiet until there is something to undo, so it never reads
                        as a button that might do nothing. */}
                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={pristine}
                        title={t("resetHint")}
                        className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-7 shrink-0 px-2 text-[0.6875rem]",
                        )}
                    >
                        <IconRotate2 className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("reset")}
                    </button>
                </div>

                {/* The shape of the key, then the settings minted into it that
                    a reader rarely changes, folded away. */}
                <div className="flex min-w-0 flex-col gap-4">
                    {/* Written out rather than an `OptionSelect`, whose label
                        cannot carry the step number. */}
                    <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-xs">
                        <StepLabel step={1} id={keySizeLabelId}>
                            {t("keySizeLabel")}
                        </StepLabel>
                        <Select
                            items={keySizeItems}
                            value={String(options.keySize)}
                            onValueChange={(next) => {
                                const size = Number(next);

                                if (next !== null && isRsaKeySize(size)) {
                                    updateOptions({ keySize: size });
                                }
                            }}
                        >
                            <SelectTrigger aria-labelledby={keySizeLabelId} className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                {RSA_KEY_SIZES.map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {keySizeItems[String(size)]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {isWeakKeySize(options.keySize)
                                ? t("keySizeHintWeak")
                                : isSlowKeySize(options.keySize)
                                  ? t("keySizeHintSlow")
                                  : t("keySizeHint")}
                        </p>
                    </div>

                    <div className="grid items-start gap-4 sm:grid-cols-2">
                        <OptionSelect
                            label={t("usageLabel")}
                            hint={t(`usageHint.${options.usage}`)}
                            value={options.usage}
                            items={usageItems}
                            values={RSA_USAGES}
                            onChange={(next) => {
                                if (isRsaUsage(next)) {
                                    updateOptions({ usage: next });
                                }
                            }}
                        />

                        <OptionSelect
                            label={t("outputFormatLabel")}
                            hint={t.rich(`outputFormatHint.${options.outputFormat}`, ARTICLE_TAGS)}
                            value={options.outputFormat}
                            items={outputFormatItems}
                            values={RSA_OUTPUT_FORMATS}
                            onChange={(next) => {
                                if (isRsaOutputFormat(next)) {
                                    updateOptions({ outputFormat: next });
                                }
                            }}
                        />
                    </div>

                    <OptionsDisclosure label={t("advanced.title")}>
                        <div className="flex min-w-0 flex-col gap-4">
                            <div className="grid items-start gap-4 sm:grid-cols-2">
                                {/* Disabled under JWK, which has no DER container
                                    for the choice to act on — and it says so
                                    rather than sitting there taking a value that
                                    changes nothing. */}
                                <OptionSelect
                                    label={t("keyFormatLabel")}
                                    hint={
                                        containerApplies
                                            ? t(`keyFormatHint.${options.keyFormat}`)
                                            : t("keyFormatDisabled")
                                    }
                                    value={options.keyFormat}
                                    items={keyFormatItems}
                                    values={RSA_KEY_FORMATS}
                                    disabled={!containerApplies}
                                    onChange={(next) => {
                                        if (isRsaKeyFormat(next)) {
                                            updateOptions({ keyFormat: next });
                                        }
                                    }}
                                />

                                <OptionSelect
                                    label={t("hashLabel")}
                                    hint={t.rich("hashHint", ARTICLE_TAGS)}
                                    value={options.hash}
                                    items={hashItems}
                                    values={RSA_HASHES}
                                    onChange={(next) => {
                                        if (isRsaHash(next)) {
                                            updateOptions({ hash: next });
                                        }
                                    }}
                                />
                            </div>

                            <AdvancedSettings
                                value={options.publicExponent}
                                invalid={exponentInvalid}
                                unportable={exponent !== null && !isPortableExponent(exponent)}
                                onChange={(publicExponent) => updateOptions({ publicExponent })}
                            />
                        </div>
                    </OptionsDisclosure>
                </div>

                <Button
                    onClick={() => void handleGenerate()}
                    disabled={generating || exponentInvalid}
                    className="h-11 w-full rounded-xl"
                >
                    {generating ? (
                        <IconLoader2 className="size-4 animate-spin" stroke={1.9} aria-hidden />
                    ) : (
                        <IconKey className="size-4" stroke={1.9} aria-hidden="true" />
                    )}
                    {material === null ? t("generate") : t("regenerate")}
                </Button>

                <div ref={resultRef} className={cn(RESULT_TRAY, "scroll-mt-24")}>
                    <StepLabel step={2}>{t("title")}</StepLabel>

                    <StatusStrip tone={status.tone} message={status.message} />

                    {/* Mapped rather than written out twice, so the two halves
                        cannot drift apart in what they offer. */}
                    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                        {RSA_KEY_KINDS.map((kind) => (
                            <KeyPanel
                                key={kind}
                                kind={kind}
                                value={
                                    kind === "public"
                                        ? (rendered?.publicKey ?? null)
                                        : (rendered?.privateKey ?? null)
                                }
                                stale={stale}
                                copied={copied === kind}
                                onCopy={() => void handleCopy(kind)}
                                onDownload={() => handleDownload(kind)}
                            />
                        ))}
                    </div>

                    {material !== null && (
                        <div className="bg-card ring-border/70 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                            <span className="text-muted-foreground text-xs leading-[1.3]">
                                {t("fingerprintLabel")}
                            </span>
                            <span className="min-w-0 flex-1 font-mono text-[0.75rem] break-all">
                                {material.fingerprint}
                            </span>
                            <IconCopyButton
                                copied={copied === "fingerprint"}
                                onClick={() => void handleCopy("fingerprint")}
                                aria-label={t("copyFingerprint")}
                                title={t("copyFingerprint")}
                            />
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleDownloadBoth}
                        disabled={rendered === null}
                        className={cn(
                            buttonVariants({ variant: "outline", size: "lg" }),
                            "h-10 w-full rounded-xl",
                        )}
                    >
                        <IconFileZip className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("downloadBoth")}
                    </button>

                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("downloadBothHint")}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
