"use client";

import { IconDice5, IconDownload, IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";

import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import {
    ALGORITHM_LABELS,
    getHashFamily,
    isCollisionBroken,
    isPasswordHash,
} from "../domain/algorithms";
import { MAX_HASH_INPUT_LENGTH } from "../domain/constants";
import type { HashAlgorithm, HashResult } from "../types";

type GeneratePanelProps = {
    algorithm: HashAlgorithm;
    text: string;
    onTextChange: (text: string) => void;
    onClear: () => void;
    onNewSalt: () => void;
    /** `null` while the hash for the current input has not landed yet. */
    result: HashResult | null;
    /** True while the typed value has not settled, so the result is one behind. */
    pending: boolean;
    copied: boolean;
    onCopy: () => void;
    onDownload: () => void;
    describeFailure: (failure: Extract<HashResult, { ok: false }>) => string;
};

export function GeneratePanel({
    algorithm,
    text,
    onTextChange,
    onClear,
    onNewSalt,
    result,
    pending,
    copied,
    onCopy,
    onDownload,
    describeFailure,
}: GeneratePanelProps) {
    const t = useTranslations("hash.workbench.generate");

    // The box caps at `maxLength`, so this can only ever count down.
    const inputLimit = useInputLimit(text.length, MAX_HASH_INPUT_LENGTH);
    const tAdvice = useTranslations("hash.workbench.advice");
    const format = useFormatter();

    const inputId = useId();
    const outputId = useId();

    const salted = getHashFamily(algorithm) !== "digest";
    const hash = result?.ok === true ? result.hash : "";

    const status: { tone: StatusTone; message: string } = (() => {
        if (text.length === 0) {
            return { tone: "idle", message: t("awaitingInput") };
        }

        if (result === null) {
            return { tone: "pending", message: t("hashing") };
        }

        return result.ok
            ? { tone: "success", message: t("ready", { algorithm: ALGORITHM_LABELS[algorithm] }) }
            : { tone: "error", message: describeFailure(result) };
    })();

    const advice: { tone: StatusTone; message: string } | null = isCollisionBroken(algorithm)
        ? {
              tone: "warning",
              message: tAdvice("collisionBroken", { algorithm: ALGORITHM_LABELS[algorithm] }),
          }
        : isPasswordHash(algorithm)
          ? { tone: "success", message: tAdvice("passwordReady") }
          : { tone: "idle", message: tAdvice("fastForPasswords") };

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <p className="text-muted-foreground max-w-2xl text-[0.8125rem] leading-normal">
                {t("description")}
            </p>

            <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:gap-6">
                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("inputLabel")}</span>
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                                {format.number(text.length)}
                            </span>
                            <InputLimitMeter reading={inputLimit} className="mr-1" />

                            <button
                                type="button"
                                onClick={onClear}
                                disabled={text.length === 0}
                                className={cn(
                                    buttonVariants({ variant: "ghost", size: "sm" }),
                                    "h-7 px-2 text-[0.6875rem]",
                                )}
                            >
                                <IconX className="size-3.5" stroke={1.9} aria-hidden="true" />
                                {t("clear")}
                            </button>
                        </div>
                    </div>

                    <Textarea
                        id={inputId}
                        value={text}
                        onChange={(event) => onTextChange(event.target.value)}
                        maxLength={MAX_HASH_INPUT_LENGTH}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        placeholder={t("inputPlaceholder")}
                        className="min-h-40 resize-y font-mono text-[0.8125rem] leading-6"
                    />

                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-muted-foreground min-w-0 flex-1 text-[0.6875rem] leading-[1.4]">
                            {salted ? t("newSaltHint") : t("saltNotUsed")}
                        </p>
                        <button
                            type="button"
                            onClick={onNewSalt}
                            disabled={!salted}
                            className={cn(
                                buttonVariants({ variant: "outline", size: "sm" }),
                                "h-7 shrink-0 px-2 text-[0.6875rem]",
                            )}
                        >
                            <IconDice5 className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {t("newSalt")}
                        </button>
                    </div>
                </div>

                <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={outputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("outputLabel")}</span>
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={onDownload}
                                disabled={hash.length === 0}
                                className={cn(
                                    buttonVariants({ variant: "outline", size: "sm" }),
                                    "h-7 px-2 text-[0.6875rem]",
                                )}
                            >
                                <IconDownload
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("download")}
                            </button>
                            <IconCopyButton
                                copied={copied}
                                onClick={onCopy}
                                disabled={hash.length === 0}
                                aria-label={t("copyOutput")}
                            />
                        </div>
                    </div>

                    <output
                        id={outputId}
                        className={cn(
                            "bg-muted/40 min-h-32 rounded-lg px-2.5 py-2",
                            "font-mono text-[0.8125rem] leading-6 break-all",
                            "transition-opacity duration-200",
                            // Dimmed rather than blanked: a stale hash is more
                            // useful than an empty box while the next one runs.
                            (pending || result === null) && "opacity-55",
                        )}
                    >
                        {hash.length > 0 ? (
                            hash
                        ) : (
                            <span className="text-muted-foreground">{t("outputPlaceholder")}</span>
                        )}
                    </output>

                    <StatusStrip tone={status.tone} message={status.message} />

                    {advice !== null && (
                        <StatusStrip
                            tone={advice.tone}
                            message={advice.message}
                            className="border-border/60 border-t pt-2"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
