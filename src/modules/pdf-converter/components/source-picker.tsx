"use client";

import { IconFileText, IconLoader2, IconUpload, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ChangeEvent, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ByteSize, useByteLabel } from "@/modules/tools/components/byte-size";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { MAX_PDF_SOURCE_BYTES, MAX_PDF_TEXT_LENGTH } from "../domain/constants";
import { PDF_PASTEABLE_FORMATS, type PdfPasteableFormat } from "../types";

/**
 * The two ways a document gets in: dropped as a file, or pasted as text.
 *
 * Two separate panels rather than one box that guesses. A `.docx` cannot be
 * pasted and a half-written README has no file, and a single control that tried
 * to serve both would have to sniff which it was looking at — which is exactly
 * the guess that makes an unclear failure later.
 */

/** What the picker offers, by extension and by type, in that order of use. */
const ACCEPTED_FILES = [
    ".docx",
    ".pptx",
    ".xlsx",
    ".xlsm",
    ".html",
    ".htm",
    ".md",
    ".markdown",
    ".mdx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/html",
    "text/markdown",
].join(",");

type FilePickerProps = {
    file: File | null;
    reading: boolean;
    /** Already-localised complaint about this file, or `null`. */
    error: string | null;
    onFile: (file: File) => void;
    onClear: () => void;
};

export function FilePicker({ file, reading, error, onFile, onClear }: FilePickerProps) {
    const t = useTranslations("pdfConverter.workbench");
    const byteLabel = useByteLabel();

    const inputId = useId();
    const errorId = useId();

    const [dragging, setDragging] = useState(false);

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const picked = event.target.files?.[0];

        if (picked) {
            onFile(picked);
        }

        // Reset so picking the same file twice still fires a change event.
        event.target.value = "";
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);

        const dropped = event.dataTransfer.files?.[0];

        if (dropped) {
            onFile(dropped);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            {/*
             * The input is a sibling *before* the label, not a child of it, which
             * is what the image tools do and what makes the whole dashed box the
             * control: `htmlFor` means a click anywhere inside it opens the
             * picker, and `peer-focus-visible` puts the focus ring on the box
             * when the visually-hidden input is the focused element. A button
             * inside the box would make the other nine tenths of it dead to a
             * pointer, which is the one thing a dropzone must not be.
             */}
            <input
                id={inputId}
                type="file"
                accept={ACCEPTED_FILES}
                onChange={handleChange}
                aria-describedby={error === null ? undefined : errorId}
                className="peer sr-only"
            />

            <label
                htmlFor={inputId}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-5 py-8 text-center",
                    "peer-focus-visible:ring-ring transition-colors duration-200 peer-focus-visible:ring-2",
                    dragging
                        ? "border-primary bg-primary/5"
                        : "border-border/80 bg-card/50 hover:border-primary/50",
                )}
            >
                {file === null ? (
                    <>
                        <IconUpload
                            className="text-muted-foreground size-6"
                            stroke={1.6}
                            aria-hidden="true"
                        />
                        <div className="flex flex-col gap-1">
                            <p className="text-[0.9375rem] leading-[1.4] font-medium">
                                {dragging ? t("dropzone.dragging") : t("dropzone.idle")}
                            </p>
                            <p className="text-muted-foreground text-xs leading-[1.5]">
                                {t("dropzone.hint", { limit: byteLabel(MAX_PDF_SOURCE_BYTES) })}
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="flex min-w-0 flex-col items-center gap-1.5">
                        {reading ? (
                            <IconLoader2
                                className="text-primary size-6 animate-spin"
                                stroke={1.6}
                                aria-hidden="true"
                            />
                        ) : (
                            <IconFileText
                                className="text-primary size-6"
                                stroke={1.6}
                                aria-hidden="true"
                            />
                        )}
                        <p className="max-w-full truncate text-[0.9375rem] leading-[1.4] font-medium">
                            {file.name}
                        </p>
                        <ByteSize
                            bytes={file.size}
                            className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums"
                        />
                        <p className="text-muted-foreground text-xs leading-[1.5]">
                            {t("dropzone.replace")}
                        </p>
                    </div>
                )}
            </label>

            {/* Outside the label rather than in it. A `<button>` nested inside a
                label is activated by the label as well as by itself, so removing
                a file would immediately reopen the picker. */}
            {file !== null && (
                <div className="flex justify-center">
                    <Button variant="ghost" size="sm" onClick={onClear}>
                        <IconX className="size-3.5" stroke={1.9} aria-hidden="true" />
                        {t("dropzone.remove")}
                    </Button>
                </div>
            )}

            {reading && <StatusStrip tone="pending" message={t("dropzone.reading")} />}
            {error !== null && <StatusStrip id={errorId} tone="error" message={error} />}
        </div>
    );
}

type PastePanelProps = {
    format: PdfPasteableFormat;
    text: string;
    /** Already-localised complaint about the text itself, or `null`. */
    error: string | null;
    onFormatChange: (format: PdfPasteableFormat) => void;
    onTextChange: (text: string) => void;
    onClear: () => void;
};

export function PastePanel({
    format,
    text,
    error,
    onFormatChange,
    onTextChange,
    onClear,
}: PastePanelProps) {
    const t = useTranslations("pdfConverter.workbench");
    const tFormats = useTranslations("pdfConverter.formats");

    const inputId = useId();
    const errorId = useId();
    const formatLabelId = useId();
    const reading = useInputLimit(text.length, MAX_PDF_TEXT_LENGTH);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
                <span id={formatLabelId} className="text-muted-foreground text-xs">
                    {t("formatLabel")}
                </span>
                <div
                    role="radiogroup"
                    aria-labelledby={formatLabelId}
                    className="bg-muted/50 ring-border/70 inline-flex w-fit gap-1 rounded-xl p-1 ring-1 ring-inset"
                >
                    {PDF_PASTEABLE_FORMATS.map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={format === value}
                            onClick={() => onFormatChange(value)}
                            className={cn(
                                "focus-visible:ring-ring rounded-lg px-3 py-1.5 text-[0.8125rem] leading-[1.3] font-medium",
                                "transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none",
                                format === value
                                    ? "bg-card text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {tFormats(value)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                        {t("pasteLabel")}
                    </Label>

                    <div className="flex items-center gap-1.5">
                        <InputLimitMeter reading={reading} className="mr-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClear}
                            disabled={text.length === 0}
                        >
                            <IconX className="size-3.5" stroke={1.9} aria-hidden="true" />
                            {t("clear")}
                        </Button>
                    </div>
                </div>

                {/* No `maxLength`: a document silently cut in half is still a
                    document, and a truncated one means something else. The meter
                    warns and the strip below refuses. */}
                <Textarea
                    id={inputId}
                    value={text}
                    onChange={(event) => onTextChange(event.target.value)}
                    placeholder={t("pastePlaceholder")}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={error !== null}
                    aria-describedby={error === null ? undefined : errorId}
                    className="bg-card/70 max-h-96 min-h-44 resize-y rounded-xl font-mono text-[0.8125rem] leading-6"
                />

                {error !== null && <StatusStrip id={errorId} tone="error" message={error} />}
            </div>
        </div>
    );
}
