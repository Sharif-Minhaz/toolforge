"use client";

import { IconClipboard, IconLoader2, IconWorldDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { importRemoteImage } from "../actions/import-remote-image";
import { readClipboardImage } from "../domain/clipboard";
import { pastedImageFilename } from "../domain/pasted-image";
import { MAX_REMOTE_IMAGE_URL_LENGTH, type RemoteImageProblem } from "../domain/remote-image";
import { useImagePaste } from "./use-image-paste";

/**
 * The two ways into an image tool that are not a file picker: the system
 * clipboard, and a picture's public address.
 *
 * Shared rather than repeated because six tools take a picture, and every one
 * of them wants both — the pitfall this avoids is six subtly different answers
 * to "what is a pasted file called" and six copies of the disclosure below.
 *
 * The disclosure is the reason this component owns its own copy instead of
 * being a hook: the URL import is the single path in the image tools that
 * leaves the browser, and `CLAUDE.md` rule 31 says a limitation on the site's
 * "nothing is uploaded" promise sits above the controls rather than in the
 * article. It renders only when the URL row does.
 */

type ImageSourceControlsProps = {
    /**
     * Handed the same shape a drop or a pick produces, so a tool wires all
     * three ways in to one function.
     */
    readonly onFiles: (files: readonly File[]) => void;
    readonly disabled?: boolean;
    /**
     * Resolved on the server, because whether the importer has a database and a
     * salt is not something the browser can know. False hides the URL row and
     * its disclosure entirely: a control that cannot work is worse than an
     * absent one, and there is nothing the reader could do about it.
     */
    readonly urlImportEnabled: boolean;
    readonly className?: string;
};

export function ImageSourceControls({
    onFiles,
    disabled = false,
    urlImportEnabled,
    className,
}: ImageSourceControlsProps) {
    const t = useTranslations("imageIntake");

    const urlId = useId();
    const errorId = useId();

    const [url, setUrl] = useState("");
    const [importing, setImporting] = useState(false);
    const [problem, setProblem] = useState<RemoteImageProblem | "clipboard_denied" | null>(null);

    // A counter rather than a clock or a random id, so nothing here is a
    // per-render source of entropy and two pastes never share a filename.
    const pasteCount = useRef(0);

    function acceptBlob(blob: Blob, type: string) {
        pasteCount.current += 1;

        onFiles([
            new File([blob], pastedImageFilename(type, pasteCount.current), {
                type,
                // Constant rather than `Date.now()`: nothing reads it, and a
                // real clock here would make the component impure.
                lastModified: 0,
            }),
        ]);
    }

    useImagePaste((file) => {
        setProblem(null);
        acceptBlob(file, file.type);
    }, !disabled);

    async function handleClipboardButton() {
        const read = await readClipboardImage();

        if (!read.ok) {
            setProblem(read.reason === "empty" ? "not_an_image" : "clipboard_denied");

            return;
        }

        setProblem(null);
        acceptBlob(read.blob, read.type);
    }

    async function handleImport() {
        const trimmed = url.trim();

        if (trimmed.length === 0 || importing) {
            return;
        }

        setImporting(true);
        setProblem(null);

        try {
            const result = await importRemoteImage({ url: trimmed });

            if (!result.ok) {
                setProblem(result.reason);

                return;
            }

            const response = await fetch(result.image.dataUrl);
            const blob = await response.blob();

            onFiles([
                new File([blob], result.image.filename, {
                    type: result.image.type,
                    lastModified: 0,
                }),
            ]);
            setUrl("");
        } catch (caught) {
            logEvent("error", "remote_image.import_threw", { error: describeError(caught) });
            setProblem("upstream_failed");
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className={cn("flex min-w-0 flex-col gap-2", className)}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="text-muted-foreground min-w-0 flex-1 text-[0.75rem] leading-normal">
                    {t("pasteHint")}
                </p>

                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void handleClipboardButton()}
                    className="h-8 px-3 text-[0.8125rem]"
                >
                    <IconClipboard className="size-4" stroke={1.8} aria-hidden="true" />
                    {t("pasteButton")}
                </Button>
            </div>

            {urlImportEnabled && (
                <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={urlId} className="text-muted-foreground text-xs leading-[1.3]">
                        {t("urlLabel")}
                    </label>

                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Input
                            id={urlId}
                            type="url"
                            inputMode="url"
                            value={url}
                            // A short identity field: one character over the
                            // ceiling is a paste accident, so the keystroke is
                            // refused rather than metered.
                            maxLength={MAX_REMOTE_IMAGE_URL_LENGTH}
                            placeholder={t("urlPlaceholder")}
                            disabled={disabled || importing}
                            aria-describedby={problem === null ? undefined : errorId}
                            aria-invalid={problem === null ? undefined : true}
                            onChange={(event) => setUrl(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    void handleImport();
                                }
                            }}
                            className="h-9 min-w-0 flex-1 font-mono text-[0.8125rem]"
                        />

                        <Button
                            type="button"
                            variant="outline"
                            disabled={disabled || importing || url.trim().length === 0}
                            onClick={() => void handleImport()}
                            className="h-9 px-3.5"
                        >
                            {importing ? (
                                <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <IconWorldDownload
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            )}
                            {importing ? t("importing") : t("import")}
                        </Button>
                    </div>
                </div>
            )}

            {problem !== null && (
                <p id={errorId} role="alert" className="text-destructive text-xs leading-normal">
                    {problem === "clipboard_denied" ? t("clipboardDenied") : t(`errors.${problem}`)}
                </p>
            )}
        </div>
    );
}
