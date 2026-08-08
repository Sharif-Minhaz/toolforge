"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { MAX_SALT_BYTES } from "../domain/constants";
import { isGcmTagLength, usesKeyDerivation } from "../domain/key";
import {
    acceptsVariableIv,
    isAuthenticated,
    ivBytesFor,
    maxIvBytesFor,
    readIvBytes,
} from "../domain/modes";
import { GCM_TAG_LENGTHS, type AesOptions } from "../types";
import { HexField } from "./hex-field";
import { NonceWidthSelect } from "./nonce-width-select";
import { IterationField } from "./iteration-field";

/**
 * The three parameters a reader rarely changes and always needs to see.
 *
 * Native `<details>` rather than the vendor Accordion, which unmounts its panel
 * when closed — folding this away while a salt is half-typed would throw the
 * half away. The Regex tool has a similar disclosure, kept separate on purpose:
 * that one is open by default, scrolls inside a fixed height and dims while a
 * match is pending, none of which applies here.
 */

export type HexTarget = "salt" | "iv";

type AdvancedSettingsProps = {
    options: AesOptions;
    /** Which of the two fields last had its value copied, if either. */
    copied: HexTarget | null;
    saltInvalid: boolean;
    ivInvalid: boolean;
    onChange: (patch: Partial<AesOptions>) => void;
    onRegenerate: (target: HexTarget) => void;
    onCopy: (target: HexTarget) => void;
    /** Draws a fresh nonce at the chosen width. GCM only. */
    onNonceWidthChange: (bytes: number) => void;
};

export function AdvancedSettings({
    options,
    copied,
    saltInvalid,
    ivInvalid,
    onChange,
    onRegenerate,
    onCopy,
    onNonceWidthChange,
}: AdvancedSettingsProps) {
    const t = useTranslations("aes.workbench.advanced");

    // A raw key is the key. Nothing is derived, so a salt and an iteration
    // count would sit there accepting values that change nothing at all.
    const derived = usesKeyDerivation(options.keySource);
    const authenticated = isAuthenticated(options.mode);
    // What is in the field, not what the mode draws — a pasted nonce of an
    // unusual width has to keep reading as that width.
    const currentIvBytes =
        readIvBytes(options.mode, options.ivHex)?.length ?? ivBytesFor(options.mode);

    const tagLengthItems: Record<string, ReactNode> = Object.fromEntries(
        GCM_TAG_LENGTHS.map((bits) => [
            String(bits),
            t("tagLengthOption", { bits, bytes: bits / 8 }),
        ]),
    );

    return (
        <details className="bg-card/60 ring-border/70 group/advanced min-w-0 rounded-xl ring-1 ring-inset">
            <summary
                className={cn(
                    "flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    "[&::-webkit-details-marker]:hidden",
                )}
            >
                <IconChevronDown
                    className="text-muted-foreground size-4 shrink-0 -rotate-90 transition-transform duration-200 group-open/advanced:rotate-0"
                    stroke={1.9}
                    aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-[0.8125rem] leading-[1.3] font-medium">
                    {t("title")}
                </span>
            </summary>

            <div className="flex flex-col gap-4 px-3 pt-1 pb-3">
                {!derived && (
                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("disabledForRawKey")}
                    </p>
                )}

                {/* `items-start`, so a taller hint in one column cannot stretch
                    the other and pull its field off the line. */}
                <div className="grid items-start gap-4 sm:grid-cols-2">
                    <HexField
                        label={t("saltLabel")}
                        // A disabled control that still describes itself
                        // working is the panel arguing with itself. Each one
                        // says why it is off instead.
                        hint={derived ? t("saltHint") : t("saltDisabled")}
                        value={options.saltHex}
                        maxLength={MAX_SALT_BYTES * 2}
                        disabled={!derived}
                        invalid={derived && saltInvalid}
                        copied={copied === "salt"}
                        regenerateLabel={t("regenerateSalt")}
                        copyLabel={t("copySalt")}
                        onChange={(saltHex) => onChange({ saltHex })}
                        onRegenerate={() => onRegenerate("salt")}
                        onCopy={() => onCopy("salt")}
                    />

                    <HexField
                        label={t("ivLabel")}
                        hint={
                            acceptsVariableIv(options.mode)
                                ? t("ivHintVariable", { bytes: ivBytesFor(options.mode) })
                                : t("ivHint", { bytes: ivBytesFor(options.mode) })
                        }
                        value={options.ivHex}
                        maxLength={maxIvBytesFor(options.mode) * 2}
                        trailing={
                            acceptsVariableIv(options.mode) ? (
                                <NonceWidthSelect
                                    value={currentIvBytes}
                                    onChange={onNonceWidthChange}
                                />
                            ) : undefined
                        }
                        disabled={false}
                        invalid={ivInvalid}
                        copied={copied === "iv"}
                        regenerateLabel={t("regenerateIv")}
                        copyLabel={t("copyIv")}
                        onChange={(ivHex) => onChange({ ivHex })}
                        onRegenerate={() => onRegenerate("iv")}
                        onCopy={() => onCopy("iv")}
                    />
                </div>

                {/* GCM is the only mode with a tag, so under CBC and CTR this
                    is disabled and says why rather than sitting there taking a
                    value that changes no byte of the output. */}
                <OptionSelect
                    label={t("tagLengthLabel")}
                    hint={authenticated ? t("tagLengthHint") : t("tagLengthDisabled")}
                    value={String(options.tagLength)}
                    items={tagLengthItems}
                    values={GCM_TAG_LENGTHS.map(String)}
                    disabled={!authenticated}
                    onChange={(next) => {
                        const bits = Number(next);

                        if (isGcmTagLength(bits)) {
                            onChange({ tagLength: bits });
                        }
                    }}
                />

                <IterationField
                    value={options.iterations}
                    disabled={!derived}
                    onChange={(iterations) => onChange({ iterations })}
                />
            </div>
        </details>
    );
}
