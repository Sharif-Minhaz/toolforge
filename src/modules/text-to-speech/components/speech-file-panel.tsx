"use client";

import { IconFileText, IconFileUpload, IconLoader2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageDropzone } from "@/modules/tools/components/image-dropzone";
import { StatusStrip } from "@/modules/tools/components/status-strip";

import { MAX_SOURCE_FILE_BYTES } from "../domain/constants";
import { extractDocumentText } from "../domain/extract";
import { SOURCE_FORMATS, type ExtractionFailureReason, type ExtractionResult } from "../types";

/** A hint to the picker, never the check: the bytes decide in `extract.ts`. */
const ACCEPT = [
    ".txt",
    ".text",
    ...SOURCE_FORMATS.filter((format) => format !== "txt").map((format) => `.${format}`),
].join(",");

/** What the hint lists. Extensions are data, not copy, so they stay out of the catalogue. */
const FORMAT_LIST = SOURCE_FORMATS.map((format) => `.${format}`).join(", ");

type SpeechFilePanelProps = {
    readonly disabled: boolean;
    readonly onExtracted: (result: Extract<ExtractionResult, { ok: true }>) => void;
};

/**
 * Pull the words out of a document so they can be read aloud.
 *
 * Everything here happens in the tab. The file is opened by this page's own
 * code, the text lands in the box on the other tab, and nothing leaves the
 * browser until the reader presses Generate — at which point only the text
 * goes, never the document.
 */
export function SpeechFilePanel({ disabled, onExtracted }: SpeechFilePanelProps) {
    const t = useTranslations("textToSpeech.file");
    const tErrors = useTranslations("textToSpeech.fileErrors");
    const byteLabel = useByteLabel();
    const inputId = useId();
    const statusId = useId();

    const [picked, setPicked] = useState<File | null>(null);
    const [working, setWorking] = useState(false);
    const [failure, setFailure] = useState<ExtractionFailureReason | null>(null);

    const tooLarge = picked !== null && picked.size > MAX_SOURCE_FILE_BYTES;

    function describe(reason: ExtractionFailureReason): string {
        return reason === "too_large"
            ? tErrors("too_large", { limit: byteLabel(MAX_SOURCE_FILE_BYTES) })
            : tErrors(reason);
    }

    function pick(files: readonly File[]) {
        const [file] = files;

        if (file === undefined) {
            return;
        }

        setPicked(file);
        setFailure(file.size > MAX_SOURCE_FILE_BYTES ? "too_large" : null);
    }

    async function extract() {
        if (picked === null || tooLarge || working) {
            return;
        }

        setWorking(true);
        setFailure(null);

        try {
            const result = await extractDocumentText(
                picked.name,
                new Uint8Array(await picked.arrayBuffer()),
            );

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            onExtracted(result);
            setPicked(null);
        } catch (caught) {
            // A reader throwing past its own guards — a PDF.js chunk that failed
            // to load, say — is still an unreadable file to the person holding it.
            logEvent("error", "text_to_speech.extract_failed", { error: describeError(caught) });
            setFailure("unreadable");
        } finally {
            setWorking(false);
        }
    }

    const status = (() => {
        if (failure !== null) {
            return { tone: "error" as const, message: describe(failure) };
        }

        if (working) {
            return { tone: "pending" as const, message: t("extracting") };
        }

        if (picked !== null) {
            return {
                tone: "idle" as const,
                message: t("picked", { name: picked.name, size: byteLabel(picked.size) }),
            };
        }

        return { tone: "idle" as const, message: t("privacy") };
    })();

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <ImageDropzone
                inputId={inputId}
                title={t("dropTitle", { limit: byteLabel(MAX_SOURCE_FILE_BYTES) })}
                hint={t("dropHint", { formats: FORMAT_LIST })}
                accept={ACCEPT}
                disabled={disabled || working}
                describedById={statusId}
                icon={IconFileUpload}
                onFiles={pick}
            />

            <StatusStrip id={statusId} tone={status.tone} message={status.message} />

            <Button
                onClick={() => void extract()}
                disabled={disabled || picked === null || tooLarge || working}
                className="h-10 w-full"
            >
                {working ? (
                    <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                    <IconFileText className="size-4" stroke={1.8} aria-hidden="true" />
                )}
                {working ? t("extracting") : t("extract")}
            </Button>
        </div>
    );
}
