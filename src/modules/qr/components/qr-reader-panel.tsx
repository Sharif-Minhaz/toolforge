"use client";

import {
    IconCamera,
    IconCameraOff,
    IconExternalLink,
    IconLoader2,
    IconPhotoUp,
    IconScan,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { copyText } from "@/modules/tools/domain/clipboard";
import { loadImageElement } from "@/modules/tools/domain/image-element";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import { readFramePixels } from "../domain/canvas";
import {
    CAMERA_SCAN_INTERVAL_MS,
    SCAN_ACCEPT_ATTRIBUTE,
    SCAN_FILE_LIMITS,
} from "../domain/constants";
import { getFollowableUrl, parseScannedText } from "../domain/scan";
import type { ScanFailureReason, ScannedPayload } from "../types";

/**
 * Reads a code back, from the camera or from a picture.
 *
 * The decoder is a 40 kB dependency that only this half of the tool needs, so it
 * is imported on first use rather than shipped with the page. The promise is
 * cached at module scope: a camera loop asks for it several times a second.
 */
let decoderPromise: Promise<typeof import("jsqr").default> | null = null;

function loadDecoder(): Promise<typeof import("jsqr").default> {
    decoderPromise ??= import("jsqr").then((module) => module.default);

    return decoderPromise;
}

type QrReaderPanelProps = {
    onDecoded?: (payload: ScannedPayload) => void;
};

export function QrReaderPanel({ onDecoded }: QrReaderPanelProps) {
    const t = useTranslations("qr.reader");
    const tFields = useTranslations("qr.scannedFields");
    const tKinds = useTranslations("qr.kinds");
    const tToast = useTranslations("qr.toast");

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<number | null>(null);
    const scanningRef = useRef(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const dropLabelId = useId();

    const [scanning, setScanning] = useState(false);
    const [decoding, setDecoding] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [result, setResult] = useState<ScannedPayload | null>(null);
    const [failure, setFailure] = useState<ScanFailureReason | null>(null);
    const [copied, setCopied] = useState(false);

    /** Releases the camera and the loop. Safe to call when neither is running. */
    function releaseCamera() {
        scanningRef.current = false;

        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        for (const track of streamRef.current?.getTracks() ?? []) {
            track.stop();
        }

        streamRef.current = null;

        if (videoRef.current !== null) {
            videoRef.current.srcObject = null;
        }
    }

    // Cleanup only — nothing here sets state, so it never trips the effect rules.
    useEffect(() => releaseCamera, []);

    function accept(payload: ScannedPayload) {
        setResult(payload);
        setFailure(null);
        setCopied(false);
        onDecoded?.(payload);
    }

    async function tick() {
        const video = videoRef.current;

        if (!scanningRef.current || video === null) {
            return;
        }

        const frame = readFramePixels(video, video.videoWidth, video.videoHeight);

        if (frame !== null) {
            const jsQR = await loadDecoder();
            // `attemptBoth` also tries the inverted image, which is what light
            // modules on a dark background look like to the decoder.
            const found = jsQR(frame.data, frame.width, frame.height, {
                inversionAttempts: "attemptBoth",
            });

            if (found !== null) {
                accept(parseScannedText(found.data));
                stopCamera();

                return;
            }
        }

        timerRef.current = window.setTimeout(() => void tick(), CAMERA_SCAN_INTERVAL_MS);
    }

    function stopCamera() {
        releaseCamera();
        setScanning(false);
    }

    async function startCamera() {
        setFailure(null);

        if (typeof navigator === "undefined" || navigator.mediaDevices === undefined) {
            setFailure("camera_missing");

            return;
        }

        try {
            // The rear camera is the one pointed at a poster; a laptop with only
            // a front camera simply gets that one.
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
            });
            const video = videoRef.current;

            if (video === null) {
                for (const track of stream.getTracks()) {
                    track.stop();
                }

                return;
            }

            streamRef.current = stream;
            video.srcObject = stream;
            await video.play();

            scanningRef.current = true;
            setScanning(true);
            void tick();
        } catch (caught) {
            releaseCamera();
            logEvent("warn", "qr.camera_unavailable", { error: describeError(caught) });
            setFailure(
                caught instanceof DOMException && caught.name === "NotFoundError"
                    ? "camera_missing"
                    : "camera_denied",
            );
        }
    }

    async function decodeFile(file: File | undefined) {
        if (file === undefined) {
            return;
        }

        const checked = checkImageFile({ type: file.type, size: file.size }, SCAN_FILE_LIMITS);

        if (!checked.ok) {
            setFailure("unreadable_image");

            return;
        }

        setDecoding(true);
        setFailure(null);

        const url = URL.createObjectURL(file);

        try {
            const image = await loadImageElement(url);

            if (image === null) {
                setFailure("unreadable_image");

                return;
            }

            const frame = readFramePixels(image, image.naturalWidth, image.naturalHeight);

            if (frame === null) {
                setFailure("unreadable_image");

                return;
            }

            const jsQR = await loadDecoder();
            const found = jsQR(frame.data, frame.width, frame.height, {
                inversionAttempts: "attemptBoth",
            });

            if (found === null) {
                setResult(null);
                setFailure("no_code");

                return;
            }

            accept(parseScannedText(found.data));
        } catch (caught) {
            logEvent("error", "qr.decode_failed", { error: describeError(caught) });
            setFailure("unreadable_image");
        } finally {
            URL.revokeObjectURL(url);
            setDecoding(false);
        }
    }

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setDragging(false);
        void decodeFile(event.dataTransfer.files[0]);
    }

    async function handleCopy() {
        if (result === null) {
            return;
        }

        const copiedResult = await copyText(result.text);

        if (copiedResult.ok) {
            setCopied(true);
            toast.success(tToast("copied"));

            return;
        }

        toast.error(tToast("copyFailed"));
    }

    const followable = result === null ? null : getFollowableUrl(result);

    return (
        <div className="flex flex-col gap-4">
            <Tabs defaultValue="camera">
                <TabsList className="w-full">
                    <TabsTrigger value="camera">{t("tabs.camera")}</TabsTrigger>
                    <TabsTrigger value="upload">{t("tabs.upload")}</TabsTrigger>
                </TabsList>

                <TabsContent value="camera" className="flex flex-col gap-3 pt-3">
                    <div className="bg-muted/40 ring-border/70 relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-inset">
                        <video
                            ref={videoRef}
                            playsInline
                            muted
                            aria-label={t("videoLabel")}
                            className={cn("size-full object-cover", !scanning && "invisible")}
                        />

                        {!scanning && (
                            <div className="text-muted-foreground absolute inset-0 grid place-items-center gap-2 text-center">
                                <IconScan
                                    className="size-8 opacity-60"
                                    stroke={1.4}
                                    aria-hidden="true"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => void startCamera()}
                            disabled={scanning}
                        >
                            <IconCamera className="size-4" stroke={1.8} aria-hidden="true" />
                            {t("start")}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={stopCamera}
                            disabled={!scanning}
                        >
                            <IconCameraOff className="size-4" stroke={1.8} aria-hidden="true" />
                            {t("stop")}
                        </Button>
                    </div>

                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("cameraHint")}
                    </p>
                </TabsContent>

                <TabsContent value="upload" className="flex flex-col gap-3 pt-3">
                    <input
                        ref={fileRef}
                        type="file"
                        accept={SCAN_ACCEPT_ATTRIBUTE}
                        className="sr-only"
                        onChange={(event) => {
                            void decodeFile(event.target.files?.[0]);
                            event.target.value = "";
                        }}
                    />

                    <div
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        className={cn(
                            "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors duration-200",
                            dragging
                                ? "border-primary bg-primary/6"
                                : "border-border/70 bg-card/40",
                        )}
                    >
                        <IconPhotoUp
                            className="text-muted-foreground size-6"
                            stroke={1.6}
                            aria-hidden="true"
                        />
                        <p id={dropLabelId} className="text-muted-foreground text-[0.8125rem]">
                            {t("dropHint")}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-describedby={dropLabelId}
                            disabled={decoding}
                            onClick={() => fileRef.current?.click()}
                        >
                            {decoding && (
                                <IconLoader2
                                    className="size-4 animate-spin"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            )}
                            {t("pickFile")}
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>

            {failure !== null && <StatusStrip tone="error" message={t(`errors.${failure}`)} />}

            {result !== null && (
                <div className="bg-card/60 ring-border/70 flex flex-col gap-3 rounded-xl p-3.5 ring-1 ring-inset">
                    <div className="flex items-center justify-between gap-2">
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[0.6875rem] leading-[1.3] font-medium">
                            {tKinds(result.kind)}
                        </span>
                        <IconCopyButton
                            copied={copied}
                            aria-label={t("copy")}
                            onClick={() => void handleCopy()}
                        />
                    </div>

                    {result.fields.length > 0 && (
                        <dl className="grid gap-1.5">
                            {result.fields.map((entry) => (
                                <div
                                    key={entry.name}
                                    className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-2"
                                >
                                    <dt className="text-muted-foreground truncate text-[0.6875rem] leading-[1.4]">
                                        {tFields(entry.name)}
                                    </dt>
                                    <dd className="min-w-0 text-[0.8125rem] leading-relaxed break-words">
                                        {entry.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}

                    <details className="group/raw">
                        <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-pointer rounded text-[0.6875rem] focus-visible:ring-2 focus-visible:outline-none">
                            {t("rawLabel")}
                        </summary>
                        <pre className="bg-background ring-border/70 mt-2 overflow-x-auto rounded-lg p-2.5 font-mono text-[0.6875rem] leading-relaxed ring-1 ring-inset">
                            {result.text}
                        </pre>
                    </details>

                    {followable !== null && (
                        <div className="flex flex-col gap-1.5">
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t("openWarning")}
                            </p>
                            <a
                                href={followable}
                                target="_blank"
                                // A scanned code is somebody else's link. The new
                                // tab gets no handle on this one and no referrer.
                                rel="noopener noreferrer nofollow"
                                className="text-primary hover:text-primary/80 focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded text-[0.8125rem] font-medium focus-visible:ring-2 focus-visible:outline-none"
                            >
                                <IconExternalLink
                                    className="size-3.5"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {t("open")}
                            </a>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
