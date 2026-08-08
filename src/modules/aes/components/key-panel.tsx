"use client";

import { IconDice5, IconEye, IconEyeOff } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { MAX_AES_SECRET_LENGTH } from "../domain/constants";
import { isKeySource } from "../domain/payload";
import { AES_KEY_SOURCES, type AesKeySize, type AesKeySource } from "../types";
import { FieldAction, FieldDivider, FieldShell, FIELD_INPUT } from "./field-shell";

type KeyPanelProps = {
    source: AesKeySource;
    keySize: AesKeySize;
    value: string;
    /**
     * Owned by the workbench rather than here, so pressing Generate can reveal
     * what it drew. A key you cannot read is no use for pasting into the system
     * that has to share it.
     */
    revealed: boolean;
    copied: boolean;
    onRevealedChange: (revealed: boolean) => void;
    onSourceChange: (source: AesKeySource) => void;
    onValueChange: (value: string) => void;
    onGenerate: () => void;
    onCopy: () => void;
};

/**
 * The secret, and where it comes from.
 *
 * Never capped with `maxLength`. Every other short field on this page is, but a
 * silently truncated passphrase derives a different key without saying so —
 * which is a wrong answer wearing the costume of a right one. The meter counts
 * down and the operation is refused instead.
 *
 * Masked by default and revealable, because a hex key has to be checked
 * character by character against wherever it came from.
 */
export function KeyPanel({
    source,
    keySize,
    value,
    revealed,
    copied,
    onRevealedChange,
    onSourceChange,
    onValueChange,
    onGenerate,
    onCopy,
}: KeyPanelProps) {
    const t = useTranslations("aes.workbench");

    const inputId = useId();
    const sourceLabelId = useId();
    const meterId = useId();

    const limit = useInputLimit(value.length, MAX_AES_SECRET_LENGTH);

    const sourceItems: Record<string, ReactNode> = Object.fromEntries(
        AES_KEY_SOURCES.map((item) => [item, t(`keySources.${item}`)]),
    );

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t("keyLabel")}</span>
                </Label>

                <div className="flex items-center gap-1.5">
                    <InputLimitMeter reading={limit} id={meterId} />
                    <Label id={sourceLabelId} className="sr-only">
                        {t("keySourceLabel")}
                    </Label>
                    <Select
                        items={sourceItems}
                        value={source}
                        onValueChange={(next) => {
                            if (next !== null && isKeySource(next)) {
                                onSourceChange(next);
                            }
                        }}
                    >
                        <SelectTrigger
                            aria-labelledby={sourceLabelId}
                            className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-[0.6875rem] shadow-none"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {AES_KEY_SOURCES.map((item) => (
                                <SelectItem key={item} value={item}>
                                    {t(`keySources.${item}`)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <FieldShell invalid={limit.state === "over"}>
                <input
                    id={inputId}
                    type={revealed ? "text" : "password"}
                    value={value}
                    onChange={(event) => onValueChange(event.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    aria-describedby={meterId}
                    aria-invalid={limit.state === "over"}
                    placeholder={t(`keyPlaceholder.${source}`)}
                    className={FIELD_INPUT}
                />

                <FieldDivider />

                <FieldAction label={t(`generateKey.${source}`)} onClick={onGenerate}>
                    <IconDice5 className="size-4" stroke={1.8} aria-hidden="true" />
                </FieldAction>
                <IconCopyButton
                    copied={copied}
                    onClick={onCopy}
                    disabled={value.length === 0}
                    aria-label={t("copyKey")}
                    title={t("copyKey")}
                    className="disabled:pointer-events-none disabled:opacity-40"
                />
                <FieldAction
                    label={revealed ? t("hideKey") : t("showKey")}
                    onClick={() => onRevealedChange(!revealed)}
                >
                    {revealed ? (
                        <IconEyeOff className="size-4" stroke={1.8} aria-hidden="true" />
                    ) : (
                        <IconEye className="size-4" stroke={1.8} aria-hidden="true" />
                    )}
                </FieldAction>
            </FieldShell>

            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {t(`keyHint.${source}`, { bits: keySize, bytes: keySize / 8 })}
            </p>
        </div>
    );
}
