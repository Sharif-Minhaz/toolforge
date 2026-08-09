"use client";

import { IconFileText, IconUpload, IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, type ChangeEvent, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ByteSize, useByteLabel } from "@/modules/tools/components/byte-size";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { TOOL_ICON_TILE } from "@/modules/tools/components/tool-accent";
import { MAX_RSA_CRYPT_INPUT_BYTES, MAX_RSA_CRYPT_INPUT_LENGTH } from "../domain/constants";
import type { RsaCryptDirection } from "../types";

export type LoadedFile = {
    readonly name: string;
    readonly bytes: Uint8Array<ArrayBuffer>;
};

type PayloadPanelProps = {
    direction: RsaCryptDirection;
    value: string;
    file: LoadedFile | null;
    /** Encoding names are proper names, so the labels arrive as data. */
    encoding: string;
    encodingItems: Record<string, ReactNode>;
    encodingValues: readonly string[];
    /** False while encrypting a file, whose bytes are the plaintext already. */
    encodingApplies: boolean;
    /**
     * How many bytes OAEP will actually take under the current key, or `null`
     * when there is no key yet to ask. Shown beside the box while encrypting,
     * because 190 bytes is a ceiling nobody expects and finding it by being
     * refused is a poor way to learn it.
     */
    messageLimit: number | null;
    onEncodingChange: (encoding: string) => void;
    onChange: (value: string) => void;
    onFileSelect: (file: File) => void;
    onClear: () => void;
};

/**
 * The box you type into — or the file you opened instead — and the encoding
 * that says how to read it.
 *
 * The typed box is never capped with `maxLength`: it is a content box, and a
 * truncated ciphertext is not a shorter ciphertext but a different one. The
 * meter counts, the failure appears under the box, and the operation refuses.
 */
export function PayloadPanel({
    direction,
    value,
    file,
    encoding,
    encodingItems,
    encodingValues,
    encodingApplies,
    messageLimit,
    onEncodingChange,
    onChange,
    onFileSelect,
    onClear,
}: PayloadPanelProps) {
    const t = useTranslations("rsaEncrypt.workbench");
    const format = useFormatter();
    const byteLabel = useByteLabel();

    const inputId = useId();
    const encodingLabelId = useId();
    const meterId = useId();

    const textLimit = useInputLimit(value.length, MAX_RSA_CRYPT_INPUT_LENGTH);
    const fileLimit = useInputLimit(file?.bytes.length ?? 0, MAX_RSA_CRYPT_INPUT_BYTES);
    const side = direction === "encrypt" ? "plaintext" : "ciphertext";
    const empty = file === null && value.length === 0;

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
                    <span className="leading-[1.3]">{t(`inputLabel.${side}`)}</span>
                </Label>

                <div className="flex items-center gap-1.5">
                    {file === null ? (
                        <>
                            <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                                {format.number(value.length)}
                            </span>
                            <InputLimitMeter reading={textLimit} id={meterId} />
                        </>
                    ) : (
                        <InputLimitMeter
                            reading={fileLimit}
                            format={byteLabel}
                            id={meterId}
                            className="mr-1"
                            always
                        />
                    )}

                    <Label id={encodingLabelId} className="sr-only">
                        {t(`encodingLabel.${side}`)}
                    </Label>
                    <Select
                        items={encodingItems}
                        value={encoding}
                        disabled={!encodingApplies}
                        onValueChange={(next) => {
                            if (next !== null) {
                                onEncodingChange(next);
                            }
                        }}
                    >
                        <SelectTrigger
                            aria-labelledby={encodingLabelId}
                            className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-[0.6875rem] shadow-none"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {encodingValues.map((item) => (
                                <SelectItem key={item} value={item}>
                                    {encodingItems[item]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* A styled label keeps the picker a real <input>, so it
                        stays keyboard reachable without an imperative click. */}
                    <label
                        className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "focus-within:ring-ring h-7 cursor-pointer px-2 text-[0.6875rem] focus-within:ring-2",
                        )}
                    >
                        <IconUpload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("openFile")}
                        <input
                            type="file"
                            className="sr-only"
                            onChange={handleFileChange}
                            aria-label={t("openFile")}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={onClear}
                        disabled={empty}
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

            {file === null ? (
                <Textarea
                    id={inputId}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    aria-describedby={meterId}
                    aria-invalid={textLimit.state === "over"}
                    placeholder={t(`inputPlaceholder.${side}`)}
                    className="min-h-32 resize-y font-mono text-[0.8125rem] leading-6"
                />
            ) : (
                <div className="bg-card/70 ring-border/70 flex items-center gap-3 rounded-xl px-3 py-3 ring-1 [--tool-accent:var(--brand-amber)] ring-inset">
                    <span className={cn(TOOL_ICON_TILE, "size-9")}>
                        <IconFileText className="size-4" stroke={1.8} aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[0.8125rem] font-medium">{file.name}</span>
                        <ByteSize
                            bytes={file.bytes.length}
                            className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums"
                        />
                    </span>
                    <button
                        type="button"
                        onClick={onClear}
                        aria-label={t("removeFile")}
                        className={cn(
                            buttonVariants({ variant: "ghost", size: "icon-sm" }),
                            "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                    </button>
                </div>
            )}

            {/* The ceiling that surprises everybody, said before it is hit
                rather than only in the refusal afterwards. */}
            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {direction === "decrypt"
                    ? t("payloadHint.ciphertext")
                    : messageLimit === null
                      ? t("payloadHint.awaitingKey")
                      : t("payloadHint.plaintext", { bytes: messageLimit })}
            </p>
        </div>
    );
}
