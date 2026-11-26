"use client";

import { IconUpload, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, type ChangeEvent } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { StepLabel } from "@/modules/tools/components/workbench-step";
import { MAX_SQL_INPUT_BYTES } from "../domain/constants";

const ACCEPTED_FILES = ".sql,.ddl,.txt,application/sql,text/plain";

type InputPanelProps = {
    text: string;
    inputId: string;
    inputBytes: number;
    /** Already-localised complaint about the input itself, or `null`. */
    error: string | null;
    onTextChange: (value: string) => void;
    onFileSelect: (file: File) => void;
    onClear: () => void;
};

export function InputPanel({
    text,
    inputId,
    inputBytes,
    error,
    onTextChange,
    onFileSelect,
    onClear,
}: InputPanelProps) {
    const t = useTranslations("sqlFormatter.workbench");

    const byteLabel = useByteLabel();
    const sizeReading = useInputLimit(inputBytes, MAX_SQL_INPUT_BYTES);
    const errorId = useId();

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const selected = event.target.files?.[0];

        if (selected) {
            onFileSelect(selected);
        }

        // Reset so picking the same file twice still fires a change event.
        event.target.value = "";
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                <StepLabel step={1} htmlFor={inputId}>
                    {t("inputLabel")}
                </StepLabel>

                <div className="flex items-center gap-1.5">
                    {/* Bytes, because that is what the ceiling measures. */}
                    <InputLimitMeter
                        reading={sizeReading}
                        format={byteLabel}
                        className="mr-1"
                        always
                    />

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
                            accept={ACCEPTED_FILES}
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

            {/* No `maxLength`: a script cut mid-statement is not a shorter
                script. The meter warns, and the strip below refuses. */}
            <Textarea
                id={inputId}
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                placeholder={t("placeholder")}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={error !== null}
                aria-describedby={error === null ? undefined : errorId}
                className="bg-card/70 max-h-96 min-h-44 resize-y rounded-xl font-mono text-[0.8125rem] leading-6"
            />

            {error !== null && <StatusStrip id={errorId} tone="error" message={error} />}
        </div>
    );
}
