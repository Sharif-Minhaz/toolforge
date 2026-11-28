"use client";

import {
    IconCube3dSphere,
    IconDownload,
    IconLoader2,
    IconSparkles,
    IconTrash,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnline } from "@/hooks/use-online";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageDropzone } from "@/modules/tools/components/image-dropzone";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { OnlineRequiredNote } from "@/modules/tools/components/online-required-note";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import {
    OptionsDisclosure,
    RESULT_TRAY,
    StepLabel,
} from "@/modules/tools/components/workbench-step";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { toFilenameStem } from "@/modules/tools/domain/filenames";
import { isDecodableImageType } from "@/modules/tools/domain/image-file";

import { describeObject } from "../actions/describe-object";
import { buildObjectMesh, meshHeight, scaleMesh } from "../domain/assemble";
import {
    GENERATION_LIMIT_PER_ADDRESS,
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FORM_FIELD,
    MAX_HEIGHT_MM,
    MAX_SOURCE_BYTES,
    MIN_HEIGHT_MM,
    TOKEN_FORM_FIELD,
    TURNSTILE_ACTION,
} from "../domain/constants";
import { buildModelDownload } from "../domain/export";
import { checkUploadImage } from "../domain/generation";
import { estimateBytes } from "../domain/stats";
import { prepareUpload } from "../domain/upload-image";
import type {
    GenerationFailureReason,
    MeshDetail,
    ModelFormat,
    ModelOptions,
    ObjectSpec,
} from "../types";
import { ModelOptionsPanel } from "./model-options";

/**
 * Three and a WebGL context are a large chunk of JavaScript to hand to a
 * reader who has not got a model yet — and to every other page. Loading it
 * here keeps it on this route and behind the first result.
 */
const ModelPreview = dynamic(() => import("./model-preview"), {
    ssr: false,
    loading: () => <Skeleton className="aspect-4/3 w-full rounded-xl" />,
});

/** Why a picked file never reached the button. Checked in the tab, before any upload. */
type PickFailure = "empty_file" | "unsupported_type" | "source_too_large" | "undecodable";

type PickedImage = {
    /** Bumped per pick, so a result can never be shown beside the wrong picture. */
    readonly id: number;
    readonly file: File;
    readonly url: string;
};

type GeneratedModel = {
    readonly pickedId: number;
    readonly spec: ObjectSpec;
};

type ImageTo3dWorkbenchProps = {
    /** Parsed from the search params on the server, so a shared link opens ready. */
    readonly initialDetail: MeshDetail;
    readonly initialFormat: ModelFormat;
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables generating. */
    readonly siteKey: string | null;
    /** Worker, key, salt, database and Turnstile secret all present. */
    readonly configured: boolean;
    /** Whether this deployment can fetch a picture by its address at all. */
    readonly urlImportEnabled: boolean;
};

function checkPick(file: File): PickFailure | null {
    if (file.size <= 0) {
        return "empty_file";
    }

    if (!isDecodableImageType(file.type)) {
        return "unsupported_type";
    }

    return file.size > MAX_SOURCE_BYTES ? "source_too_large" : null;
}

function clampHeight(millimetres: number): number {
    return Math.min(MAX_HEIGHT_MM, Math.max(MIN_HEIGHT_MM, Math.round(millimetres)));
}

export function ImageTo3dWorkbench({
    initialDetail,
    initialFormat,
    siteKey,
    configured,
    urlImportEnabled,
}: ImageTo3dWorkbenchProps) {
    const t = useTranslations("imageTo3d.workbench");
    const tErrors = useTranslations("imageTo3d.errors");
    const tFormats = useTranslations("imageTo3d.formats");
    const tShapes = useTranslations("imageTo3d.shapes");
    const tToast = useTranslations("imageTo3d.toast");
    const byteLabel = useByteLabel();
    const online = useOnline();
    const { ref: resultRef, scrollToResult } = useResultScroll();

    const inputId = useId();
    const statusId = useId();

    const [detail, setDetail] = useState<MeshDetail>(initialDetail);
    const [format, setFormat] = useState<ModelFormat>(initialFormat);
    // `null` follows the object's own size; a number is the reader's override.
    const [heightOverride, setHeightOverride] = useState<number | null>(null);

    const [picked, setPicked] = useState<PickedImage | null>(null);
    const [pickFailure, setPickFailure] = useState<PickFailure | null>(null);
    const [generated, setGenerated] = useState<GeneratedModel | null>(null);
    const [failure, setFailure] = useState<GenerationFailureReason | null>(null);
    const [generating, setGenerating] = useState(false);
    /**
     * Seconds since Generate was pressed. A model call takes ten to forty-five
     * seconds and has no progress of its own to report, so a counting clock is
     * the honest way to say "still working". Set from an interval started by
     * the press, never derived from the clock during render.
     */
    const [elapsed, setElapsed] = useState(0);
    const [downloading, setDownloading] = useState(false);

    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);

    const nextId = useRef(0);
    const clock = useRef<number | null>(null);
    const pickedUrl = useRef<string | null>(null);

    useEffect(
        () => () => {
            if (clock.current !== null) {
                window.clearInterval(clock.current);
            }

            if (pickedUrl.current !== null) {
                URL.revokeObjectURL(pickedUrl.current);
            }
        },
        [],
    );

    // Only a result for the picture on screen counts; a new pick hides the old
    // model rather than captioning it with the wrong photograph.
    const spec = generated !== null && generated.pickedId === picked?.id ? generated.spec : null;

    // Rebuilt for the detail setting only. The height is a uniform scale applied
    // at download, so dragging it never tears down the preview the reader has
    // just finished orbiting.
    const built = useMemo(
        () => (spec === null ? null : buildObjectMesh(spec, detail)),
        [spec, detail],
    );
    const naturalHeight = built === null ? null : clampHeight(meshHeight(built.mesh));
    const height = heightOverride ?? naturalHeight ?? MIN_HEIGHT_MM;
    const options: ModelOptions = { height, detail, format };

    const challengeReady = token !== null;
    const canGenerate =
        configured &&
        siteKey !== null &&
        online &&
        picked !== null &&
        pickFailure === null &&
        challengeReady &&
        !generating;

    /** A Turnstile token is single-use, so every attempt draws a fresh one. */
    function renewChallenge() {
        setToken(null);
        setResetSignal((current) => current + 1);
    }

    function replacePicked(next: PickedImage | null) {
        if (pickedUrl.current !== null) {
            URL.revokeObjectURL(pickedUrl.current);
        }

        pickedUrl.current = next?.url ?? null;
        setPicked(next);
    }

    function accept(files: readonly File[]) {
        const file = files[0];

        if (file === undefined || generating) {
            return;
        }

        const problem = checkPick(file);

        setFailure(null);
        setPickFailure(problem);

        if (problem !== null) {
            replacePicked(null);

            return;
        }

        nextId.current += 1;
        replacePicked({ id: nextId.current, file, url: URL.createObjectURL(file) });
    }

    function clear() {
        replacePicked(null);
        setPickFailure(null);
        setFailure(null);
    }

    function stopClock() {
        if (clock.current !== null) {
            window.clearInterval(clock.current);
            clock.current = null;
        }
    }

    async function generate() {
        if (!canGenerate || picked === null || token === null) {
            return;
        }

        const current = picked;

        setGenerating(true);
        setFailure(null);
        setElapsed(0);
        stopClock();
        clock.current = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1_000);

        try {
            const upload = await prepareUpload(current.file);

            if (upload === null) {
                setPickFailure("undecodable");

                return;
            }

            const checked = checkUploadImage({ type: upload.type, size: upload.size });

            if (!checked.ok) {
                setFailure(checked.reason);

                return;
            }

            const body = new FormData();

            body.set(IMAGE_FORM_FIELD, upload, "upload.jpg");
            body.set(TOKEN_FORM_FIELD, token);

            const result = await describeObject(body);

            if (!result.ok) {
                setFailure(result.reason);
                logEvent("warn", "image_to_3d.generation_failed", { reason: result.reason });

                return;
            }

            setGenerated({ pickedId: current.id, spec: result.spec });
            setHeightOverride(null);
            // Only now: the destination exists and has a model in it.
            scrollToResult();
        } catch (caught) {
            setFailure("upstream_unavailable");
            logEvent("error", "image_to_3d.generation_threw", { error: describeError(caught) });
        } finally {
            stopClock();
            setGenerating(false);
            renewChallenge();
        }
    }

    function patchOptions(patch: Partial<ModelOptions>) {
        if (patch.format !== undefined) {
            setFormat(patch.format);
        }

        if (patch.detail !== undefined) {
            setDetail(patch.detail);
        }

        if (patch.height !== undefined) {
            setHeightOverride(clampHeight(patch.height));
        }
    }

    function download() {
        if (built === null || spec === null || picked === null || downloading) {
            return;
        }

        setDownloading(true);

        try {
            const file = buildModelDownload({
                mesh: scaleMesh(built.mesh, height),
                format,
                name: spec.name,
                stem: toFilenameStem(picked.file.name),
                // The reader's own clock: a ZIP records local time with no
                // offset, so this is the value that reads correctly in the file
                // manager that opens it.
                generatedAt: new Date(),
            });

            saveBlob(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (error) {
            logEvent("error", "image_to_3d.export", { detail: describeError(error) });
            toast.error(tToast("downloadFailed"));
        } finally {
            setDownloading(false);
        }
    }

    function describeFailure(reason: GenerationFailureReason | PickFailure): string {
        switch (reason) {
            case "source_too_large":
                return tErrors(reason, { limit: byteLabel(MAX_SOURCE_BYTES) });
            case "rate_limited":
                return tErrors(reason, { limit: GENERATION_LIMIT_PER_ADDRESS });
            default:
                return tErrors(reason);
        }
    }

    const status = ((): { tone: StatusTone; message: string } => {
        if (!configured || siteKey === null) {
            return { tone: "error", message: tErrors("not_configured") };
        }

        if (generating) {
            return { tone: "pending", message: t("generating", { seconds: elapsed }) };
        }

        if (pickFailure !== null) {
            return { tone: "error", message: describeFailure(pickFailure) };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure) };
        }

        if (picked === null) {
            return { tone: "idle", message: t("statusIdle") };
        }

        if (spec !== null && built !== null) {
            return {
                tone: "success",
                message: t("statusBuilt", { name: spec.name, count: built.stats.parts }),
            };
        }

        if (challengeFailed) {
            return { tone: "warning", message: t("challengeFailed") };
        }

        return challengeReady
            ? { tone: "success", message: t("ready") }
            : { tone: "pending", message: t("challengePending") };
    })();

    return (
        <Card>
            <CardContent className="flex min-w-0 flex-col gap-6">
                {/* Every setting has a default, and none of them costs a second
                    model call — they shape the file, not the description — so
                    the panel is folded above the intake. */}
                <OptionsDisclosure>
                    <ModelOptionsPanel
                        options={options}
                        heightDisabled={built === null}
                        onPatch={patchOptions}
                    />
                </OptionsDisclosure>

                <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex min-w-0 flex-col gap-2">
                        <StepLabel step={1} htmlFor={inputId}>
                            {t("dropTitle")}
                        </StepLabel>
                        <ImageDropzone
                            inputId={inputId}
                            describedById={statusId}
                            accept={IMAGE_ACCEPT_ATTRIBUTE}
                            disabled={generating}
                            // The step label above carries the title and labels
                            // the same input; the box keeps the hint.
                            title={null}
                            hint={t("dropHint", { limit: byteLabel(MAX_SOURCE_BYTES) })}
                            onFiles={accept}
                        />
                        <ImageSourceControls
                            onFiles={accept}
                            disabled={generating}
                            urlImportEnabled={urlImportEnabled}
                        />
                    </div>

                    {picked !== null && (
                        <div className="flex min-w-0 items-center gap-3">
                            {/* The reader's own picture, from an object URL in
                                this tab — next/image would be a remote loader
                                for a local blob. */}
                            <img
                                src={picked.url}
                                alt={t("previewAlt", { name: picked.file.name })}
                                decoding="async"
                                className="ring-border/70 bg-muted/40 size-20 shrink-0 rounded-lg object-contain ring-1 ring-inset"
                            />
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <p className="truncate font-mono text-[0.8125rem]">
                                    {picked.file.name}
                                </p>
                                <p className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                                    {byteLabel(picked.file.size)}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={generating}
                                onClick={clear}
                                className="shrink-0"
                            >
                                <IconTrash className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("clear")}
                            </Button>
                        </div>
                    )}

                    {siteKey !== null && configured && (
                        // Reserves the widget's height so the button below does
                        // not jump once Cloudflare's script finishes loading.
                        <div className="min-h-16 w-full max-w-82 min-w-0">
                            <TurnstileWidget
                                siteKey={siteKey}
                                action={TURNSTILE_ACTION}
                                resetSignal={resetSignal}
                                onVerify={(verified) => {
                                    setChallengeFailed(false);
                                    setToken(verified);
                                }}
                                onExpire={() => setToken(null)}
                                onError={() => {
                                    setChallengeFailed(true);
                                    setToken(null);
                                }}
                            />
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={() => void generate()} disabled={!canGenerate}>
                            {generating ? (
                                <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <IconSparkles className="size-4" stroke={1.8} aria-hidden="true" />
                            )}
                            {generating ? t("generatingShort") : t("generate")}
                        </Button>

                        {!online && <OnlineRequiredNote kind="feature" />}
                    </div>

                    <StatusStrip id={statusId} tone={status.tone} message={status.message} />
                </div>

                <div ref={resultRef} className="flex min-w-0 scroll-mt-24 flex-col gap-2">
                    <StepLabel step={2}>{t("resultTitle")}</StepLabel>

                    {built === null || spec === null ? (
                        <div className="text-muted-foreground bg-muted/30 ring-border/70 flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center text-xs leading-[1.5] ring-1 ring-inset">
                            <IconCube3dSphere
                                className="size-8 opacity-40"
                                stroke={1.4}
                                aria-hidden="true"
                            />
                            <span className="max-w-[46ch]">{t("empty")}</span>
                        </div>
                    ) : (
                        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                            <figure className="flex min-w-0 flex-col gap-1.5">
                                <ModelPreview
                                    key={generated?.pickedId}
                                    mesh={built.mesh}
                                    className="aspect-4/3 w-full"
                                />
                                <figcaption className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("previewHint")}
                                </figcaption>
                            </figure>

                            {/* The model in words: what each coloured piece is.
                                The text equivalent of the canvas beside it, and
                                the list of names the downloaded file carries. */}
                            <div className="flex min-w-0 flex-col gap-2">
                                <p className="text-sm font-medium">
                                    {t("partsTitle", { name: spec.name })}
                                </p>
                                <ul className="ring-border/70 divide-border/70 flex max-h-80 min-w-0 flex-col divide-y overflow-y-auto rounded-xl ring-1 ring-inset">
                                    {built.mesh.groups.map((group, index) => (
                                        <li
                                            key={`${index}-${group.name}`}
                                            className="flex min-w-0 items-center gap-2.5 px-3 py-2 text-xs"
                                        >
                                            {/* The part's colour as the model
                                                read it off the photograph — a
                                                paint swatch, not a theme colour. */}
                                            <span
                                                aria-hidden="true"
                                                className="ring-border size-3.5 shrink-0 rounded-sm ring-1"
                                                style={{
                                                    backgroundColor: `rgb(${group.color.join(" ")})`,
                                                }}
                                            />
                                            <span className="min-w-0 flex-1 truncate">
                                                {group.mirrored
                                                    ? t("mirroredPart", { name: group.name })
                                                    : group.name}
                                            </span>
                                            <span className="text-muted-foreground shrink-0">
                                                {tShapes(`${group.shape}Name`)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("partsNote")}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* The tray holds where the file is taken from, not the viewport
                    above it: a drag-to-turn canvas stays a canvas. */}
                <div className={RESULT_TRAY}>
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-1">
                            <p className="text-sm tabular-nums">
                                {built === null
                                    ? "—"
                                    : [
                                          t("statsHeight", { height }),
                                          t("statsTriangles", { count: built.stats.triangles }),
                                          t("statsSize", {
                                              size: byteLabel(estimateBytes(built.stats, format)),
                                          }),
                                      ].join(" · ")}
                            </p>
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {format === "glb" ? t("unitMetres") : t("unitMillimetres")}
                            </p>
                        </div>

                        <Button
                            variant="outline"
                            onClick={download}
                            disabled={built === null || downloading || generating}
                            className="shrink-0"
                        >
                            <IconDownload className="size-4" stroke={1.9} aria-hidden="true" />
                            {downloading
                                ? t("preparing")
                                : `${t("download")} · ${tFormats(`${format}Name`)}`}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
