"use client";

import { IconCube3dSphere, IconDownload, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageDropzone } from "@/modules/tools/components/image-dropzone";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { toFilenameStem } from "@/modules/tools/domain/filenames";
import {
    CUTOUT_MODELS,
    DOWNLOAD_LABEL_DELAY_MS,
    RUNTIME_WASM_BYTES,
} from "@/modules/tools/domain/segmentation";
import type { CutoutQuality, SegmentationProgress } from "@/modules/tools/types/segmentation";

import { MAX_SOURCE_BYTES } from "../domain/constants";
import { buildModelDownload } from "../domain/export";
import { buildModel } from "../domain/model";
import {
    IMAGE_ACCEPT_ATTRIBUTE,
    readModelSource,
    type ModelSource,
    type SourceFailureReason,
} from "../domain/source";
import { estimateBytes } from "../domain/stats";
import type { MeshOptions, ModelFormat, ModelOptions, ModelRefusal } from "../types";
import { ModelOptionsPanel } from "./model-options";

/**
 * Three, its loaders and a WebGL context are a large chunk of JavaScript to
 * hand to a reader who has not picked a picture yet — and to every other page
 * that imports nothing of the sort. Loading it here keeps it on this route and
 * behind the first pick.
 */
const ModelPreview = dynamic(() => import("./model-preview"), {
    ssr: false,
    loading: () => <Skeleton className="aspect-4/3 w-full rounded-xl" />,
});

type PickedSource = {
    /** Bumped per pick, so replacing a file with itself still counts as new. */
    readonly id: number;
    /** Kept so turning the cut-out on later can re-read it without a second drop. */
    readonly file: File;
    readonly source: ModelSource;
    readonly previewUrl: string;
    readonly originalTextureUrl: string | null;
    readonly cutTextureUrl: string | null;
};

type ImageTo3dWorkbenchProps = {
    /** Parsed from the search params on the server, so a shared link opens ready. */
    readonly initialOptions: ModelOptions;
    readonly initialCutout: boolean;
    /** Whether this deployment can fetch a picture by its address at all. */
    readonly urlImportEnabled: boolean;
};

/**
 * `fast` rather than the Background Remover's `balanced`.
 *
 * That tool is opened to find out whether the edge of somebody's hair looks
 * right, and the quantised model is visibly worse at exactly that. Here the
 * mask decides an *outline* that is then resampled onto a grid of at most a few
 * hundred points and inflated into a solid — a difference the geometry cannot
 * express — so the honest default is the one that costs the reader 44 MB rather
 * than 88 MB.
 */
const DEFAULT_QUALITY: CutoutQuality = "fast";

export function ImageTo3dWorkbench({
    initialOptions,
    initialCutout,
    urlImportEnabled,
}: ImageTo3dWorkbenchProps) {
    const t = useTranslations("imageTo3d.workbench");
    const tErrors = useTranslations("imageTo3d.errors");
    const tFormats = useTranslations("imageTo3d.formats");
    const tToast = useTranslations("imageTo3d.toast");
    const byteLabel = useByteLabel();
    const { ref: resultRef, scrollToResult } = useResultScroll();

    const inputId = useId();
    const hintId = useId();

    // Three states rather than one, and the split is the point. The format is
    // not a property of the mesh, so it must not sit in the object the builder
    // is keyed on — folded together, switching GLB to STL rebuilt a hundred
    // thousand triangles and reset the orbit the reader had just set. The
    // cut-out is not one either: it changes the *pixels*, which means re-reading
    // the file rather than rebuilding from it.
    const [geometry, setGeometry] = useState<MeshOptions>(initialOptions);
    const [format, setFormat] = useState<ModelFormat>(initialOptions.format);
    const [cutout, setCutout] = useState(initialCutout);
    const [quality] = useState<CutoutQuality>(DEFAULT_QUALITY);

    const [picked, setPicked] = useState<PickedSource | null>(null);
    const [reading, setReading] = useState(false);
    const [progress, setProgress] = useState<SegmentationProgress | null>(null);
    /**
     * Whether the model's assets have been arriving long enough to be worth
     * naming.
     *
     * The library reports `fetch:` progress whether the bytes come from the
     * network or straight back out of the browser cache, so "Fetching the
     * model…" would otherwise appear on every run — including the ones that are
     * over in a blink. Elapsed time is the signal that separates the two, and it
     * is held as state set by a timer rather than read from the clock during
     * render, which would be an impure call in the render pass.
     */
    const [slowDownload, setSlowDownload] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [pickFailure, setPickFailure] = useState<SourceFailureReason | null>(null);

    const nextId = useRef(0);
    const downloadLabelTimer = useRef<number | null>(null);
    // Held outside state so the unmount cleanup sees every URL ever handed out.
    const objectUrls = useRef(new Set<string>());

    useEffect(() => {
        const urls = objectUrls.current;

        return () => {
            for (const url of urls) {
                URL.revokeObjectURL(url);
            }

            urls.clear();

            if (downloadLabelTimer.current !== null) {
                window.clearTimeout(downloadLabelTimer.current);
            }
        };
    }, []);

    // The mesh is the expensive derivation on this page, so it settles before it
    // is rebuilt. Dragging the depth slider would otherwise rebuild a hundred
    // thousand triangles for every pixel the thumb moved. The format picker is
    // a discrete choice and is deliberately not part of this.
    const settled = useDebouncedValue(geometry);
    const stale = settled !== geometry;

    // Which pixels the mesh is built from. Both layers are held, so turning the
    // cut-out off is instant and turning it back on costs nothing either — the
    // model only runs again for a picture that has never been through it.
    const layer =
        picked === null
            ? null
            : cutout && picked.source.cut !== null
              ? picked.source.cut
              : picked.source.original;
    const textureUrl =
        picked === null
            ? null
            : layer === picked.source.cut
              ? picked.cutTextureUrl
              : picked.originalTextureUrl;

    const model = useMemo(
        () => (layer === null ? null : buildModel(layer.pixels, settled)),
        [layer, settled],
    );

    const refusal: ModelRefusal | null = model !== null && !model.ok ? model.reason : null;

    function trackUrl(url: string): string {
        objectUrls.current.add(url);

        return url;
    }

    function releasePicked(previous: PickedSource | null) {
        if (previous === null) {
            return;
        }

        for (const url of [
            previous.previewUrl,
            previous.originalTextureUrl,
            previous.cutTextureUrl,
        ]) {
            if (url !== null) {
                URL.revokeObjectURL(url);
                objectUrls.current.delete(url);
            }
        }
    }

    function textureUrlFor(texture: { bytes: Uint8Array; mimeType: string } | null): string | null {
        if (texture === null) {
            return null;
        }

        return trackUrl(
            URL.createObjectURL(new Blob([texture.bytes.slice()], { type: texture.mimeType })),
        );
    }

    async function read(file: File, wantsCutout: boolean) {
        if (reading) {
            return;
        }

        setReading(true);
        setPickFailure(null);
        setProgress(null);
        setSlowDownload(false);

        // A timeout in a ref rather than an effect: this is an event-driven
        // side effect of a press, and doing it in an effect would trip
        // `react-hooks/set-state-in-effect`.
        if (downloadLabelTimer.current !== null) {
            window.clearTimeout(downloadLabelTimer.current);
        }

        downloadLabelTimer.current = window.setTimeout(
            () => setSlowDownload(true),
            DOWNLOAD_LABEL_DELAY_MS,
        );

        try {
            const result = await readModelSource(file, {
                cutout: wantsCutout,
                quality,
                onProgress: setProgress,
            });

            if (!result.ok) {
                setPickFailure(result.reason);

                return;
            }

            nextId.current += 1;

            const entry: PickedSource = {
                id: nextId.current,
                file,
                source: result.source,
                previewUrl: trackUrl(URL.createObjectURL(file)),
                originalTextureUrl: textureUrlFor(result.source.original.texture),
                cutTextureUrl: textureUrlFor(result.source.cut?.texture ?? null),
            };

            setPicked((previous) => {
                releasePicked(previous);

                return entry;
            });

            scrollToResult();
        } catch (error) {
            logEvent("error", "image-to-3d.read", { detail: describeError(error) });
            setPickFailure("undecodable");
        } finally {
            if (downloadLabelTimer.current !== null) {
                window.clearTimeout(downloadLabelTimer.current);
                downloadLabelTimer.current = null;
            }

            setReading(false);
            setProgress(null);
            setSlowDownload(false);
        }
    }

    function accept(files: readonly File[]) {
        const file = files[0];

        if (file !== undefined) {
            void read(file, cutout);
        }
    }

    /**
     * Turning the cut-out on for a picture that has never been through the model
     * is the one option change that has to go back to the file.
     */
    function toggleCutout(next: boolean) {
        setCutout(next);

        if (
            next &&
            picked !== null &&
            picked.source.cut === null &&
            !picked.source.hadAlpha &&
            !reading
        ) {
            void read(picked.file, true);
        }
    }

    function patchOptions(patch: Partial<ModelOptions>) {
        const { format: nextFormat, ...rest } = patch;

        if (nextFormat !== undefined) {
            setFormat(nextFormat);
        }

        if (Object.keys(rest).length > 0) {
            setGeometry((current) => ({ ...current, ...rest }));
        }
    }

    function clear() {
        setPicked((previous) => {
            releasePicked(previous);

            return null;
        });
        setPickFailure(null);
    }

    function download() {
        if (model === null || !model.ok || layer === null || picked === null || downloading) {
            return;
        }

        setDownloading(true);

        try {
            const file = buildModelDownload({
                mesh: model.mesh,
                format,
                texture: layer.texture,
                stem: toFilenameStem(picked.source.name),
                // The reader's own clock: a ZIP records local time with no
                // offset, so this is the value that reads correctly in the file
                // manager that opens it.
                generatedAt: new Date(),
            });

            saveBlob(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (error) {
            logEvent("error", "image-to-3d.export", { detail: describeError(error) });
            toast.error(tToast("downloadFailed"));
        } finally {
            setDownloading(false);
        }
    }

    const stats = model !== null && model.ok ? model.stats : null;
    const cutoutBytes = CUTOUT_MODELS[quality].bytes + RUNTIME_WASM_BYTES.gpu;

    const status = ((): { tone: StatusTone; message: string } => {
        if (reading) {
            if (progress === null) {
                return { tone: "pending", message: t("reading") };
            }

            return {
                tone: "pending",
                message:
                    progress.phase === "download" && slowDownload
                        ? t("fetchingModel", { size: byteLabel(cutoutBytes) })
                        : t("cuttingOut"),
            };
        }

        if (pickFailure !== null) {
            return { tone: "error", message: tErrors(pickFailure) };
        }

        if (refusal !== null) {
            return {
                tone: "error",
                message: tErrors(refusal, {
                    count: model !== null && !model.ok ? (model.triangles ?? 0) : 0,
                }),
            };
        }

        if (picked === null) {
            return { tone: "idle", message: t("statusIdle") };
        }

        if (picked.source.cutFailure !== null) {
            return { tone: "warning", message: tErrors(picked.source.cutFailure) };
        }

        if (picked.source.hadAlpha) {
            return { tone: "success", message: t("statusHadAlpha") };
        }

        return {
            tone: "success",
            message: picked.source.cut === null ? t("statusWhole") : t("statusCut"),
        };
    })();

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <div className="flex min-w-0 flex-col gap-2">
                    <ImageDropzone
                        inputId={inputId}
                        describedById={hintId}
                        accept={IMAGE_ACCEPT_ATTRIBUTE}
                        disabled={reading}
                        title={t("dropTitle")}
                        hint={t("dropHint", { limit: byteLabel(MAX_SOURCE_BYTES) })}
                        onFiles={accept}
                    />

                    <ImageSourceControls
                        onFiles={accept}
                        disabled={reading}
                        urlImportEnabled={urlImportEnabled}
                    />

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                <ModelOptionsPanel
                    options={{ ...geometry, format }}
                    cutout={cutout}
                    cutoutDownloadLabel={byteLabel(cutoutBytes)}
                    cutoutAlreadyTransparent={picked?.source.hadAlpha ?? false}
                    disabled={picked === null || reading}
                    onPatch={patchOptions}
                    onCutoutChange={toggleCutout}
                />

                <div ref={resultRef} className="scroll-mt-24">
                    {picked === null ? (
                        <p className="text-muted-foreground bg-muted/30 ring-border/70 rounded-xl px-4 py-8 text-center text-xs leading-[1.5] ring-1 ring-inset">
                            {t("empty")}
                        </p>
                    ) : (
                        <div
                            className={cn(
                                "grid min-w-0 gap-3 transition-opacity duration-200 sm:grid-cols-2",
                                // Dimmed rather than cleared: a blank panel
                                // between keystrokes reads as a failure.
                                stale && "opacity-55",
                            )}
                        >
                            <figure className="flex min-w-0 flex-col gap-1.5">
                                {/* The reader's own picture, drawn from an object
                                    URL in this tab — next/image would be a
                                    remote loader for a local blob. */}
                                <img
                                    src={textureUrl ?? picked.previewUrl}
                                    alt={picked.source.name}
                                    className="bg-muted/40 ring-border/70 aspect-4/3 w-full rounded-xl object-contain ring-1 ring-inset"
                                />
                                <figcaption className="flex min-w-0 items-center justify-between gap-2">
                                    <span className="text-muted-foreground min-w-0 truncate text-[0.6875rem]">
                                        {t("sourceSummary", {
                                            name: picked.source.name,
                                            width: picked.source.width,
                                            height: picked.source.height,
                                        })}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 shrink-0 px-2 text-xs"
                                        onClick={clear}
                                    >
                                        <IconTrash
                                            className="size-3.5"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                        {t("clear")}
                                    </Button>
                                </figcaption>
                            </figure>

                            <figure className="flex min-w-0 flex-col gap-1.5">
                                {model !== null && model.ok ? (
                                    <ModelPreview
                                        key={picked.id}
                                        mesh={model.mesh}
                                        textureUrl={textureUrl}
                                        className="aspect-4/3 w-full"
                                    />
                                ) : (
                                    <div className="bg-muted/40 ring-border/70 text-muted-foreground flex aspect-4/3 w-full items-center justify-center rounded-xl px-6 text-center text-xs ring-1 ring-inset">
                                        <IconCube3dSphere
                                            className="size-8 opacity-40"
                                            stroke={1.4}
                                            aria-hidden="true"
                                        />
                                    </div>
                                )}
                                <figcaption className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("previewHint")}
                                </figcaption>
                            </figure>
                        </div>
                    )}
                </div>

                <div className="border-border/70 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-muted-foreground text-xs font-medium">
                            {t("statsTitle")}
                        </p>
                        <p className="text-sm tabular-nums">
                            {stats === null
                                ? "—"
                                : [
                                      t("statsTriangles", { count: stats.triangles }),
                                      t("statsVertices", { count: stats.vertices }),
                                      t("statsSize", {
                                          size: byteLabel(estimateBytes(stats, format)),
                                      }),
                                  ].join(" · ")}
                        </p>
                        <p className="text-muted-foreground max-w-[62ch] text-[0.6875rem] leading-[1.4]">
                            {format === "glb" ? t("unitMetres") : t("unitMillimetres")}
                        </p>
                    </div>

                    <Button
                        onClick={download}
                        disabled={stats === null || downloading || reading}
                        className="shrink-0"
                    >
                        <IconDownload className="size-4" stroke={1.9} aria-hidden="true" />
                        {downloading
                            ? t("preparing")
                            : `${t("download")} · ${tFormats(`${format}Name`)}`}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
