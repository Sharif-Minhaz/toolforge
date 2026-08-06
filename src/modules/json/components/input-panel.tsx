"use client";

import { IconSparkles, IconUpload, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { MAX_JSON_INPUT_BYTES } from "../domain/constants";
import type { JsonMode } from "../types";

type InputPanelProps = {
    mode: JsonMode;
    text: string;
    inputId: string;
    inputBytes: number;
    onTextChange: (value: string) => void;
    onFileSelect: (file: File) => void;
    onSample: () => void;
    onClear: () => void;
};

export function InputPanel({
    mode,
    text,
    inputId,
    inputBytes,
    onTextChange,
    onFileSelect,
    onSample,
    onClear,
}: InputPanelProps) {
    const t = useTranslations("json.workbench");

    const byteLabel = useByteLabel();
    const sizeReading = useInputLimit(inputBytes, MAX_JSON_INPUT_BYTES);

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const selected = event.target.files?.[0];

        if (selected) {
            onFileSelect(selected);
        }

        // Reset so picking the same file twice still fires a change event.
        event.target.value = "";
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t("inputLabel")}</span>
                </Label>

                <div className="flex flex-wrap items-center gap-1.5">
                    {/* Against the ceiling rather than a bare size, so the
                        number goes amber before the tool refuses rather than
                        only after. Bytes, because that is what the limit is
                        measured in. */}
                    <InputLimitMeter
                        reading={sizeReading}
                        format={byteLabel}
                        className="mr-1"
                        always
                    />

                    <button
                        type="button"
                        onClick={onSample}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                        <IconSparkles className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("sample")}
                    </button>

                    {/* A styled label keeps the file picker a real <input>, so it
                        stays keyboard reachable without any imperative click. */}
                    <label
                        className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "focus-within:ring-ring cursor-pointer focus-within:ring-2",
                        )}
                    >
                        <IconUpload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("upload")}
                        <input
                            type="file"
                            accept=".json,.jsonc,.txt,application/json,text/plain"
                            className="sr-only"
                            onChange={handleFileChange}
                            aria-label={t("upload")}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={onClear}
                        disabled={text.length === 0}
                        className={cn(
                            buttonVariants({ variant: "ghost", size: "icon-sm" }),
                            "text-muted-foreground hover:text-foreground",
                        )}
                        aria-label={t("clear")}
                    >
                        <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <Textarea
                id={inputId}
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                placeholder={t(`placeholders.${mode}`)}
                spellCheck={false}
                autoComplete="off"
                className="bg-card/70 h-72 min-h-40 resize-y rounded-xl font-mono text-[0.8125rem] leading-6"
            />
        </div>
    );
}
