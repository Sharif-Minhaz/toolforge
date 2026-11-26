"use client";

import { IconDownload, IconEraser, IconCircleCheck, IconAlertTriangle } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageDropzone } from "@/modules/tools/components/image-dropzone";
import { OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { toFilenameStem } from "@/modules/tools/domain/filenames";
import { DEFAULT_STRIP_OPTIONS, MAX_PHOTO_BYTES, PHOTO_ACCEPT } from "../domain/constants";
import {
    detectPhotoFormat,
    FORMAT_LABELS,
    FORMAT_MIME_TYPES,
    isStrippable,
} from "../domain/format";
import { readPhotoMetadata } from "../domain/read";
import { stripPhoto } from "../domain/strip";
import type {
    PhotoFormat,
    ReadFailureReason,
    ReadResult,
    StripFailureReason,
    StripOptions,
    StripSuccess,
} from "../types";
import { PhotoFacts } from "./photo-facts";
import { PrivacyFindings } from "./privacy-findings";
import { TagTable } from "./tag-table";

type Loaded = {
    readonly name: string;
    /** An object URL for the picked file, revoked when the next pick replaces it. */
    readonly previewUrl: string;
    readonly size: number;
    readonly bytes: Uint8Array;
    readonly format: PhotoFormat | null;
    readonly read: ReadResult;
};

type Cleaned =
    | { readonly ok: true; readonly result: StripSuccess; readonly check: ReadResult }
    | { readonly ok: false; readonly reason: StripFailureReason };

/** Extensions for the clean copy, from the container — never from the name it came in with. */
const EXTENSIONS: Readonly<Record<"jpeg" | "png" | "webp", string>> = {
    jpeg: "jpg",
    png: "png",
    webp: "webp",
};

export function PhotoExifWorkbench() {
    const t = useTranslations("photoExif.workbench");
    const tErrors = useTranslations("photoExif.errors");
    const tToast = useTranslations("photoExif.toast");
    const formatter = useFormatter();
    const byteLabel = useByteLabel();

    const inputId = useId();
    const hintId = useId();

    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [reading, setReading] = useState(false);
    const [pickError, setPickError] = useState<ReadFailureReason | null>(null);
    const [options, setOptions] = useState<StripOptions>(DEFAULT_STRIP_OPTIONS);
    const [cleaned, setCleaned] = useState<Cleaned | null>(null);
    const [cleaning, setCleaning] = useState(false);
    // Each pick bumps this, so a slow read of an earlier photo cannot land
    // on top of a later one.
    const pickToken = useRef(0);
    const previewUrl = useRef<string | null>(null);
    // The URL whose image failed to decode — HEIC outside Safari — so the
    // fallback follows the photo it belongs to and clears on the next pick.
    const [brokenPreview, setBrokenPreview] = useState<string | null>(null);

    // An object URL holds the whole file in memory until it is revoked.
    useEffect(
        () => () => {
            if (previewUrl.current !== null) {
                URL.revokeObjectURL(previewUrl.current);
            }
        },
        [],
    );

    function replacePreview(next: string | null) {
        if (previewUrl.current !== null) {
            URL.revokeObjectURL(previewUrl.current);
        }
        previewUrl.current = next;
    }
    const { ref: cleanRef, scrollToResult } = useResultScroll();

    function describeError(reason: ReadFailureReason | StripFailureReason): string {
        return reason === "too_large"
            ? tErrors("too_large", { limit: byteLabel(MAX_PHOTO_BYTES) })
            : tErrors(reason);
    }

    async function handlePick(files: readonly File[]) {
        const file = files[0];

        if (file === undefined) {
            return;
        }

        const token = ++pickToken.current;

        setCleaned(null);
        setPickError(null);

        // Refused before reading: a file past the ceiling is never pulled into memory.
        if (file.size > MAX_PHOTO_BYTES) {
            replacePreview(null);
            setLoaded(null);
            setPickError("too_large");
            return;
        }

        setReading(true);

        const bytes = new Uint8Array(await file.arrayBuffer());
        const read = await readPhotoMetadata(bytes);

        if (token !== pickToken.current) {
            return;
        }

        setReading(false);

        if (!read.ok && (read.reason === "empty" || read.reason === "unsupported_format")) {
            replacePreview(null);
            setLoaded(null);
            setPickError(read.reason);
            return;
        }

        const url = URL.createObjectURL(file);

        replacePreview(url);
        setLoaded({
            name: file.name,
            previewUrl: url,
            size: file.size,
            bytes,
            format: detectPhotoFormat(bytes),
            read,
        });
    }

    function patch(next: Partial<StripOptions>) {
        setOptions((current) => ({ ...current, ...next }));
        // A clean copy made under the old options would no longer match the switches.
        setCleaned(null);
    }

    async function handleStrip() {
        if (loaded === null) {
            return;
        }

        const token = pickToken.current;

        setCleaning(true);

        const result = stripPhoto(loaded.bytes, options);

        if (!result.ok) {
            setCleaning(false);
            setCleaned({ ok: false, reason: result.reason });
            scrollToResult();
            return;
        }

        // Read back with the same parser: the claim that the copy is clean is
        // checked against the copy, not assumed from the code that made it.
        const check = await readPhotoMetadata(result.bytes);

        if (token !== pickToken.current) {
            return;
        }

        setCleaning(false);
        setCleaned({ ok: true, result, check });
        scrollToResult();
    }

    function handleDownload(result: StripSuccess) {
        if (loaded === null) {
            return;
        }

        saveBlob({
            filename: `${toFilenameStem(loaded.name)}-clean.${EXTENSIONS[result.format]}`,
            blob: new Blob([result.bytes], { type: FORMAT_MIME_TYPES[result.format] }),
        });
        toast.success(tToast("downloaded"));
    }

    const read = loaded?.read ?? null;
    const formatLabel =
        loaded?.format === null || loaded === null ? "" : FORMAT_LABELS[loaded.format];
    const strippable = loaded?.format != null && isStrippable(loaded.format);

    const status: { tone: StatusTone; message: string } = reading
        ? { tone: "pending", message: t("reading") }
        : read === null
          ? { tone: "idle", message: t("statusIdle") }
          : !read.ok
            ? { tone: "error", message: describeError(read.reason) }
            : read.tagCount === 0
              ? { tone: "success", message: t("statusEmpty", { format: formatLabel }) }
              : {
                    tone: read.findings.length > 0 ? "warning" : "success",
                    message: t("statusReady", { count: read.tagCount, format: formatLabel }),
                };

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={1} htmlFor={inputId}>
                            {t("pickLabel")}
                        </StepLabel>
                    </div>
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-stretch">
                        {loaded !== null &&
                            (brokenPreview === loaded.previewUrl ? (
                                <p className="ring-border/70 bg-muted/40 text-muted-foreground flex h-40 w-full shrink-0 items-center justify-center rounded-xl p-4 text-center text-xs leading-[1.5] ring-1 ring-inset sm:w-56">
                                    {t("previewUnavailable", { format: formatLabel })}
                                </p>
                            ) : (
                                /*
                                 * A plain `<img>`, deliberately: the source is an
                                 * object URL for a file the reader just chose, so
                                 * there is no origin to allowlist and nothing for
                                 * `next/image` to optimise. The browser applies the
                                 * EXIF orientation itself, as a viewer would.
                                 */
                                <img
                                    src={loaded.previewUrl}
                                    alt={t("previewAlt", { name: loaded.name })}
                                    decoding="async"
                                    onError={() => setBrokenPreview(loaded.previewUrl)}
                                    className="ring-border/70 bg-muted/40 h-40 w-full shrink-0 rounded-xl object-contain ring-1 ring-inset sm:w-56"
                                />
                            ))}
                        <ImageDropzone
                            inputId={inputId}
                            describedById={hintId}
                            compact={loaded !== null}
                            accept={PHOTO_ACCEPT}
                            disabled={reading}
                            title={loaded === null ? t("dropTitle") : t("dropAnother")}
                            hint={
                                <span id={hintId}>
                                    {loaded === null
                                        ? t("dropHint", { limit: byteLabel(MAX_PHOTO_BYTES) })
                                        : t("fileSummary", {
                                              name: loaded.name,
                                              format: formatLabel,
                                              size: byteLabel(loaded.size),
                                          })}
                                </span>
                            }
                            onFiles={handlePick}
                            className="min-w-0 flex-1"
                        />
                    </div>
                    {pickError !== null && (
                        <StatusStrip tone="error" message={describeError(pickError)} />
                    )}
                </div>

                <div className={RESULT_TRAY}>
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={2}>{t("revealsLabel")}</StepLabel>
                    </div>

                    {read !== null && read.ok && (
                        <div className={cn("flex flex-col gap-4", reading && "opacity-55")}>
                            <PrivacyFindings findings={read.findings} facts={read.facts} />
                            <PhotoFacts facts={read.facts} />
                            {read.tagCount === 0 ? (
                                <p className="text-muted-foreground text-xs">{t("noTags")}</p>
                            ) : (
                                <details className="group/tags">
                                    <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium transition-colors duration-150">
                                        {t("allTagsLabel", {
                                            count: formatter.number(read.tagCount),
                                        })}
                                    </summary>
                                    <div className="pt-3">
                                        <TagTable groups={read.groups} />
                                    </div>
                                </details>
                            )}
                        </div>
                    )}

                    <StatusStrip tone={status.tone} message={status.message} />
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex min-h-7 items-center">
                        <StepLabel step={3}>{t("stripLabel")}</StepLabel>
                    </div>

                    {loaded !== null && !strippable && loaded.format !== null && (
                        <p className="text-muted-foreground text-xs leading-[1.5]">
                            {t("stripUnavailable", { format: formatLabel })}
                        </p>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2">
                        <OptionSwitch
                            label={t("keepProfileLabel")}
                            hint={t("keepProfileHint")}
                            checked={options.keepColorProfile}
                            onCheckedChange={(keepColorProfile) => patch({ keepColorProfile })}
                        />
                        <OptionSwitch
                            label={t("keepOrientationLabel")}
                            hint={t("keepOrientationHint")}
                            checked={options.keepOrientation}
                            onCheckedChange={(keepOrientation) => patch({ keepOrientation })}
                        />
                    </div>

                    <div>
                        <Button
                            type="button"
                            onClick={handleStrip}
                            disabled={loaded === null || !strippable || cleaning || reading}
                        >
                            <IconEraser className="size-4" stroke={1.9} aria-hidden="true" />
                            {t("stripButton")}
                        </Button>
                    </div>

                    <div ref={cleanRef} className="scroll-mt-24">
                        {cleaned !== null && !cleaned.ok && (
                            <StatusStrip tone="error" message={describeError(cleaned.reason)} />
                        )}
                        {cleaned !== null && cleaned.ok && loaded !== null && (
                            <CleanCopy
                                result={cleaned.result}
                                check={cleaned.check}
                                originalSize={loaded.size}
                                onDownload={() => handleDownload(cleaned.result)}
                            />
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

type CleanCopyProps = {
    result: StripSuccess;
    check: ReadResult;
    originalSize: number;
    onDownload: () => void;
};

/** What the strip did, checked against the copy it made, and the button that hands it over. */
function CleanCopy({ result, check, originalSize, onDownload }: CleanCopyProps) {
    const t = useTranslations("photoExif.workbench");
    const byteLabel = useByteLabel();
    const leftovers = check.ok ? check.findings : [];

    return (
        <div className={RESULT_TRAY}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{t("cleanLabel")}</span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {t("sizeChange", {
                        before: byteLabel(originalSize),
                        after: byteLabel(result.bytes.length),
                    })}
                </span>
            </div>

            {result.removed.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t("nothingRemoved")}</p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground text-xs font-medium">
                        {t("removedLabel")}
                    </span>
                    <ul className="flex flex-wrap gap-1.5">
                        {result.removed.map((block) => (
                            <li
                                key={block.kind}
                                className="bg-card ring-border/70 rounded-md px-2 py-1 text-xs ring-1 ring-inset"
                            >
                                {t("removedItem", {
                                    kind: t(`removedKinds.${block.kind}`),
                                    size: byteLabel(block.bytes),
                                })}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <ul className="text-muted-foreground flex flex-col gap-1 text-xs leading-[1.5]">
                {result.keptOrientation !== null && <li>{t("keptOrientation")}</li>}
                {result.keptColorProfile && <li>{t("keptProfile")}</li>}
                <li>{t("lossless")}</li>
            </ul>

            {leftovers.length === 0 ? (
                <p className="text-success flex items-start gap-1.5 text-xs leading-[1.5] font-medium">
                    <IconCircleCheck
                        className="mt-px size-4 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    {t("verified")}
                </p>
            ) : (
                <p className="text-destructive flex items-start gap-1.5 text-xs leading-[1.5] font-medium">
                    <IconAlertTriangle
                        className="mt-px size-4 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    {t("verifyFailed", {
                        findings: leftovers.map((finding) => t(`findings.${finding}`)).join(", "),
                    })}
                </p>
            )}

            <div>
                <Button type="button" onClick={onDownload} disabled={leftovers.length > 0}>
                    <IconDownload className="size-4" stroke={1.9} aria-hidden="true" />
                    {t("download")}
                </Button>
            </div>
        </div>
    );
}
