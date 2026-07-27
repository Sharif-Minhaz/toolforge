"use client";

import { IconFileText, IconUpload, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ByteSize } from "@/modules/tools/components/byte-size";
import { TOOL_ICON_TILE } from "@/modules/tools/components/tool-accent";
import type { UrlMode } from "../types";

export type LoadedFile = {
    readonly name: string;
    readonly bytes: Uint8Array;
};

type InputPanelProps = {
    mode: UrlMode;
    text: string;
    file: LoadedFile | null;
    inputId: string;
    inputBytes: number;
    onTextChange: (value: string) => void;
    onFileSelect: (file: File) => void;
    onClear: () => void;
};

export function InputPanel({
    mode,
    text,
    file,
    inputId,
    inputBytes,
    onTextChange,
    onFileSelect,
    onClear,
}: InputPanelProps) {
    const t = useTranslations("url.workbench");
    const empty = file === null && text.length === 0;

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
                    {t("inputLabel")}
                </Label>

                <div className="flex items-center gap-1.5">
                    <ByteSize
                        bytes={inputBytes}
                        className="text-muted-foreground mr-1 font-mono text-[0.6875rem] tabular-nums"
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
                            className="sr-only"
                            onChange={handleFileChange}
                            aria-label={t("upload")}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={onClear}
                        disabled={empty}
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

            {file ? (
                <div className="bg-card/70 ring-border/70 flex items-center gap-3 rounded-xl px-3 py-3 ring-1 [--tool-accent:var(--brand-cyan)] ring-inset">
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
            ) : (
                <Textarea
                    id={inputId}
                    value={text}
                    onChange={(event) => onTextChange(event.target.value)}
                    placeholder={t(`placeholders.${mode}`)}
                    spellCheck={false}
                    autoComplete="off"
                    className="bg-card/70 max-h-72 min-h-32 resize-y rounded-xl font-mono text-[0.8125rem] leading-6 break-all"
                />
            )}
        </div>
    );
}
