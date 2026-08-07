"use client";

import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { MAX_AES_SECRET_LENGTH } from "../domain/constants";
import { isKeySource } from "../domain/payload";
import { AES_KEY_SOURCES, type AesKeySize, type AesKeySource } from "../types";

type KeyPanelProps = {
    source: AesKeySource;
    keySize: AesKeySize;
    value: string;
    onSourceChange: (source: AesKeySource) => void;
    onValueChange: (value: string) => void;
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
export function KeyPanel({ source, keySize, value, onSourceChange, onValueChange }: KeyPanelProps) {
    const t = useTranslations("aes.workbench");
    const [revealed, setRevealed] = useState(false);

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

            <div className="flex items-center gap-1.5">
                <Input
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
                    className="h-9 min-w-0 flex-1 font-mono text-[0.8125rem]"
                />
                <button
                    type="button"
                    onClick={() => setRevealed((current) => !current)}
                    aria-label={revealed ? t("hideKey") : t("showKey")}
                    aria-pressed={revealed}
                    className={cn(
                        "text-muted-foreground grid size-7 shrink-0 place-items-center rounded-lg",
                        "hover:bg-muted hover:text-foreground transition-colors duration-200",
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    )}
                >
                    {revealed ? (
                        <IconEyeOff className="size-4" stroke={1.8} aria-hidden="true" />
                    ) : (
                        <IconEye className="size-4" stroke={1.8} aria-hidden="true" />
                    )}
                </button>
            </div>

            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {t(`keyHint.${source}`, { bits: keySize, bytes: keySize / 8 })}
            </p>
        </div>
    );
}
