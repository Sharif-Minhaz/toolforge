"use client";

import { IconUpload, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, type ChangeEvent } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import type { RsaKeyKind } from "@/modules/tools/types";
import { KEY_PLACEHOLDERS, MAX_RSA_KEY_LENGTH } from "../domain/constants";
import type { RsaKeyInputFormat } from "../types";

type KeyInputPanelProps = {
    value: string;
    kind: RsaKeyKind;
    format: RsaKeyInputFormat;
    onChange: (value: string) => void;
    onFileSelect: (file: File) => void;
    onClear: () => void;
};

/**
 * The box the key is pasted into.
 *
 * Never capped with `maxLength`. This is a content box, and a truncated key is
 * not a shorter key — it is a parse failure that would blame the wrong thing.
 * The meter counts, the ceiling is refused, and the import says why.
 *
 * The placeholder shows the shape rather than describing it, because "paste a
 * PEM block" is less use than seeing which header the current Key Type expects.
 */
export function KeyInputPanel({
    value,
    kind,
    format,
    onChange,
    onFileSelect,
    onClear,
}: KeyInputPanelProps) {
    const t = useTranslations("rsaEncrypt.workbench");

    const inputId = useId();
    const meterId = useId();

    const limit = useInputLimit(value.length, MAX_RSA_KEY_LENGTH);

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const selected = event.target.files?.[0];

        if (selected) {
            onFileSelect(selected);
        }

        // Reset so picking the same file twice still fires a change event.
        event.target.value = "";
    }

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t(`keyLabel.${kind}`)}</span>
                </Label>

                <div className="flex items-center gap-1.5">
                    <InputLimitMeter reading={limit} id={meterId} />

                    {/* A styled label keeps the picker a real <input>, so it
                        stays keyboard reachable without an imperative click. */}
                    <label
                        className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "focus-within:ring-ring h-7 cursor-pointer px-2 text-[0.6875rem] focus-within:ring-2",
                        )}
                    >
                        <IconUpload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("uploadKey")}
                        <input
                            type="file"
                            className="sr-only"
                            onChange={handleFileChange}
                            aria-label={t("uploadKey")}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={onClear}
                        disabled={value.length === 0}
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
                value={value}
                onChange={(event) => onChange(event.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                aria-describedby={meterId}
                aria-invalid={limit.state === "over"}
                placeholder={KEY_PLACEHOLDERS[format][kind]}
                className="min-h-32 resize-y font-mono text-[0.8125rem] leading-6"
            />

            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">{t("keyNotice")}</p>
        </div>
    );
}
