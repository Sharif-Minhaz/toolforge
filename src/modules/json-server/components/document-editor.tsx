"use client";

import { IconFileUpload, IconIndentIncrease, IconSparkles } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { getByteLength } from "@/modules/tools/domain/byte-size";

import { MAX_UPLOAD_BYTES } from "../domain/constants";
import { formatDocumentText } from "../domain/format";
import { SAMPLE_DOCUMENT } from "../domain/samples";
import type { DocumentFailure } from "../types";

type DocumentEditorProps = {
    value: string;
    onChange: (value: string) => void;
    /** Rendered under the box; carries a line and column when the parser found one. */
    failure: DocumentFailure | null;
    disabled?: boolean;
    /** Hidden on the workbench, where a fresh sample would discard somebody's data. */
    showSample?: boolean;
    className?: string;
};

/**
 * The box a `db.json` is written or pasted into, everywhere it appears.
 *
 * One component for the create form and the workbench's editor, because the
 * three affordances around it — **Format**, **Upload a file**, and the size
 * counter — are the same in both, and two copies would be two places for the
 * limit to be described differently.
 *
 * **Format runs the JSON Formatter's own reader and writer** — the ones that
 * moved to `tools/domain/` when this tool needed them, so the output is the
 * same as pasting into that tool and pressing Beautify. See
 * `domain/format.ts` for why it is not `JSON.stringify(JSON.parse(…))`.
 *
 * The counter is **live and against the upload ceiling**, not the storage one.
 * They are different numbers on purpose — see `domain/usage.ts` — and the one
 * that applies while you are typing into a box is the one that decides whether
 * the box can be submitted.
 */
export function DocumentEditor({
    value,
    onChange,
    failure,
    disabled = false,
    showSample = false,
    className,
}: DocumentEditorProps) {
    const t = useTranslations("jsonServer.editor");
    const tProblems = useTranslations("jsonServer.documentProblems");
    const editorId = useId();
    const statusId = useId();
    const fileRef = useRef<HTMLInputElement>(null);
    const [formatFailed, setFormatFailed] = useState(false);

    const byteLabel = useByteLabel();
    const bytes = getByteLength(value);
    const overSize = bytes > MAX_UPLOAD_BYTES;
    const sizeLabel = byteLabel(bytes);
    const limitLabel = byteLabel(MAX_UPLOAD_BYTES);

    function format() {
        const formatted = formatDocumentText(value);

        if (formatted === null) {
            // Nothing is rewritten when it cannot be read. A Format button that
            // emptied the editor on a stray comma would be the worst possible
            // reading of it, so the text is left exactly as typed and the line
            // underneath says why nothing happened.
            setFormatFailed(true);

            return;
        }

        setFormatFailed(false);
        onChange(formatted);
    }

    async function readFile(file: File | undefined) {
        if (file === undefined) {
            return;
        }

        onChange(await file.text());
        setFormatFailed(false);

        // Cleared so choosing the same file twice fires `change` the second time.
        if (fileRef.current !== null) {
            fileRef.current.value = "";
        }
    }

    const status: { tone: StatusTone; message: string } | null = overSize
        ? { tone: "error", message: t("tooLarge", { limit: limitLabel }) }
        : failure !== null
          ? {
                tone: "error",
                message:
                    failure.line === undefined
                        ? tProblems(failure.reason)
                        : t("atLine", {
                              problem: tProblems(failure.reason),
                              line: failure.line,
                              column: failure.column ?? 1,
                          }),
            }
          : formatFailed
            ? { tone: "warning", message: t("formatFailed") }
            : null;

    return (
        <div className={cn("flex min-w-0 flex-col gap-2", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={disabled || value.trim().length === 0}
                        onClick={format}
                    >
                        <IconIndentIncrease className="size-3.5" stroke={1.9} aria-hidden="true" />
                        {t("format")}
                    </Button>

                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={disabled}
                        onClick={() => fileRef.current?.click()}
                    >
                        <IconFileUpload className="size-3.5" stroke={1.9} aria-hidden="true" />
                        {t("upload")}
                    </Button>

                    {showSample ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            disabled={disabled}
                            onClick={() => {
                                onChange(SAMPLE_DOCUMENT);
                                setFormatFailed(false);
                            }}
                        >
                            <IconSparkles className="size-3.5" stroke={1.9} aria-hidden="true" />
                            {t("sample")}
                        </Button>
                    ) : null}

                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json,.json5,text/plain"
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={(event) => void readFile(event.target.files?.[0])}
                    />
                </div>

                <p
                    className={cn(
                        "text-[0.6875rem] leading-[1.3] tabular-nums",
                        overSize ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {t("size", { size: sizeLabel, limit: limitLabel })}
                </p>
            </div>

            <CodeEditor
                id={editorId}
                value={value}
                language="json"
                placeholder={t("placeholder")}
                ariaDescribedBy={status === null ? undefined : statusId}
                onChange={(next) => {
                    onChange(next);
                    setFormatFailed(false);
                }}
                className="min-h-64"
            />

            {status !== null ? (
                <StatusStrip id={statusId} tone={status.tone} message={status.message} />
            ) : null}
        </div>
    );
}
