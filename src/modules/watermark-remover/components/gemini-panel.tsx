"use client";

import {
    IconEraser,
    IconLoader2,
    IconPhotoPlus,
    IconRefresh,
    IconTrash,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { buildCleanImageFilename } from "../domain/export";
import {
    GEMINI_ACCEPT_ATTRIBUTE,
    GEMINI_FALLBACK_CORNER,
    MAX_GEMINI_IMAGE_BYTES,
} from "../domain/gemini-constants";
import { cleanGeminiImage, probeGeminiImage } from "../domain/gemini-pipeline";
import { planCornerBox, toPixelBox } from "../domain/watermark-box";
import {
    BOX_CORNERS,
    type BoxCorner,
    type CleanedImage,
    type GeminiFailureReason,
    type NormalizedBox,
    type SourceImageFacts,
} from "../types";
import { CleanedResult } from "./cleaned-result";
import { WatermarkBoxEditor } from "./watermark-box-editor";

/** The picked picture, its preview URL, and what the browser said about it. */
type Picked = {
    readonly file: File;
    readonly url: string;
    readonly facts: SourceImageFacts;
};

/**
 * Everything one answer is about, so a later pick or a moved box cannot rewrite
 * the context the result was produced in. `beforeUrl` is the result's own handle
 * on the original: the preview's URL is revoked the moment a new picture is
 * chosen, and the comparison has to survive that.
 */
type Cleaned = {
    readonly url: string;
    readonly beforeUrl: string;
    readonly image: CleanedImage;
    readonly facts: SourceImageFacts;
    readonly box: NormalizedBox;
    /** Carried so flipping the switch marks the answer stale, as moving the box does. */
    readonly fillWholeBox: boolean;
};

function isBoxCorner(value: string): value is BoxCorner {
    return (BOX_CORNERS as readonly string[]).includes(value);
}

/**
 * The Gemini half: undo the blend that put a sparkle in one corner of a still.
 *
 * Nothing here is uploaded and nothing here is a model — which is the whole
 * point of it sitting beside the picture tab rather than inside it. The picture
 * tab sends a square to an inpainting service and gets back something *plausible*
 * where the watermark was. This one recovers what was actually there, because a
 * generator's mark is white composited over the picture at a known strength and
 * that operation has an inverse. No network, no bot check, no queue.
 *
 * **Choosing a file is the whole interaction.** The run starts on the pick, and
 * the corner is searched for rather than asked about — a reader who drops a
 * generated image should get a clean one back without being quizzed about where
 * the sparkle is, which they can see perfectly well and the tool can measure.
 * Every control below the picture exists for the run that got it wrong: move the
 * box, name the corner, or rebuild the whole square. Each of them re-runs
 * immediately, so a correction is one action rather than two.
 */
export function GeminiPanel() {
    const t = useTranslations("watermarkRemover.gemini");
    const tErrors = useTranslations("watermarkRemover.geminiErrors");
    const tToast = useTranslations("watermarkRemover.geminiToast");
    const byteLabel = useByteLabel();
    const formatter = useFormatter();

    const inputId = useId();
    const hintId = useId();
    const boxHintId = useId();
    const fillId = useId();
    const cornerId = useId();

    const [picked, setPicked] = useState<Picked | null>(null);
    // `null` while the first run is still deciding, and never again after it.
    const [box, setBox] = useState<NormalizedBox | null>(null);
    const [corner, setCorner] = useState<BoxCorner>(GEMINI_FALLBACK_CORNER);
    const [scanning, setScanning] = useState(false);
    const [fillWholeBox, setFillWholeBox] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [probing, setProbing] = useState(false);
    const [working, setWorking] = useState(false);
    const [result, setResult] = useState<Cleaned | null>(null);
    const [failure, setFailure] = useState<GeminiFailureReason | null>(null);
    const { ref: resultRef, scrollToResult } = useResultScroll();

    // Revoking on the way out rather than in the picker: the cleanup fires both
    // when the preview is replaced and when the page is left, so there is one
    // rule instead of one per exit.
    useEffect(() => {
        const url = picked?.url;

        return () => {
            if (url !== undefined) {
                URL.revokeObjectURL(url);
            }
        };
    }, [picked?.url]);

    useEffect(() => {
        const urls = result === null ? [] : [result.url, result.beforeUrl];

        return () => {
            for (const url of urls) {
                URL.revokeObjectURL(url);
            }
        };
    }, [result]);

    const busy = probing || working;
    const canRemove = picked !== null && !busy;
    const stale =
        result !== null &&
        (result.facts !== picked?.facts ||
            result.box !== box ||
            result.fillWholeBox !== fillWholeBox);

    function describeFailure(reason: GeminiFailureReason): string {
        switch (reason) {
            case "missing_image":
                return tErrors("missing_image");
            case "empty_file":
                return tErrors("empty_file");
            case "unsupported_type":
                return tErrors("unsupported_type");
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_GEMINI_IMAGE_BYTES) });
            case "undecodable":
                return tErrors("undecodable");
            case "no_canvas":
                return tErrors("no_canvas");
            case "mark_not_found":
                return tErrors("mark_not_found");
            case "clean_failed":
                return tErrors("clean_failed");
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (probing) {
            return { tone: "pending", message: t("reading") };
        }

        if (working) {
            return { tone: "pending", message: scanning ? t("scanning") : t("working") };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure) };
        }

        if (picked === null) {
            return {
                tone: "idle",
                message: t("pickPrompt", { limit: byteLabel(MAX_GEMINI_IMAGE_BYTES) }),
            };
        }

        return stale
            ? { tone: "warning", message: t("resultStale") }
            : { tone: "success", message: t("readyToRemove") };
    }

    function fail(reason: GeminiFailureReason) {
        setResult(null);
        setFailure(reason);
        toast.error(describeFailure(reason));
    }

    async function handlePick(file: File | undefined) {
        if (file === undefined || busy) {
            return;
        }

        setProbing(true);
        setFailure(null);

        let chosen: Picked;

        try {
            const probe = await probeGeminiImage(file);

            if (!probe.ok) {
                logEvent("warn", "watermark_remover.gemini_probe_failed", {
                    reason: probe.reason,
                    detail: probe.detail ?? null,
                });
                setPicked(null);
                setBox(null);
                fail(probe.reason);

                return;
            }

            chosen = { file, url: URL.createObjectURL(file), facts: probe.facts };

            setPicked(chosen);
            setBox(null);
            setResult(null);
        } catch (caught) {
            logEvent("error", "watermark_remover.gemini_probe_threw", {
                error: describeError(caught),
            });
            setPicked(null);
            setBox(null);
            fail("undecodable");

            return;
        } finally {
            setProbing(false);
        }

        // Straight into the run, with no box: the tool measures all four corners
        // and the reader is told where it landed rather than asked in advance.
        await runClean(chosen, null, fillWholeBox);
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        void handlePick(event.dataTransfer.files[0]);
    }

    /**
     * One run, against an explicit box or against none at all.
     *
     * Every argument is passed rather than read from state, because each caller
     * is acting on something it has only just decided — the file a pick
     * returned, the corner a select changed to — and state set in the same tick
     * is not readable yet.
     */
    async function runClean(source: Picked, next: NormalizedBox | null, fill: boolean) {
        setWorking(true);
        setScanning(next === null);
        setFailure(null);

        try {
            const outcome = await cleanGeminiImage({
                file: source.file,
                box: next,
                fillWholeBox: fill,
            });

            if (!outcome.ok) {
                // `detail` is the decoder's own words. Logged, never rendered:
                // the reader gets the localised sentence for the reason.
                logEvent("warn", "watermark_remover.gemini_clean_failed", {
                    reason: outcome.reason,
                    detail: outcome.detail ?? null,
                });

                // A failed search still has to leave a box on the picture, or
                // there is nothing for the reader to correct.
                if (next === null) {
                    setCorner(GEMINI_FALLBACK_CORNER);
                    setBox(
                        planCornerBox(
                            { width: source.facts.width, height: source.facts.height },
                            GEMINI_FALLBACK_CORNER,
                        ),
                    );
                }

                fail(outcome.reason);

                return;
            }

            // Where the work actually happened, which on the first run is
            // something the tool found rather than something anybody chose.
            setBox(outcome.image.box);
            setCorner(outcome.image.corner);
            setResult({
                url: URL.createObjectURL(outcome.image.blob),
                beforeUrl: URL.createObjectURL(source.file),
                image: outcome.image,
                facts: source.facts,
                box: outcome.image.box,
                fillWholeBox: fill,
            });
            scrollToResult();
            toast.success(tToast("removed"));
        } catch (caught) {
            logEvent("error", "watermark_remover.gemini_clean_threw", {
                error: describeError(caught),
            });
            fail("clean_failed");
        } finally {
            setWorking(false);
            setScanning(false);
        }
    }

    function handleCornerChange(next: BoxCorner) {
        if (picked === null || busy) {
            return;
        }

        const planned = planCornerBox(
            { width: picked.facts.width, height: picked.facts.height },
            next,
        );

        setCorner(next);
        setBox(planned);
        void runClean(picked, planned, fillWholeBox);
    }

    function handleFillChange(next: boolean) {
        setFillWholeBox(next);

        if (picked !== null && box !== null && !busy) {
            void runClean(picked, box, next);
        }
    }

    async function handleRemove() {
        if (picked === null || !canRemove) {
            return;
        }

        await runClean(picked, box, fillWholeBox);
    }

    function handleClear() {
        setPicked(null);
        setBox(null);
        setResult(null);
        setFailure(null);
    }

    function handleDownload(current: Cleaned) {
        const download = {
            filename: buildCleanImageFilename(current.facts.name, new Date()),
            blob: current.image.blob,
        };

        try {
            saveBlob(download);
            toast.success(tToast("downloaded", { filename: download.filename }));
        } catch (caught) {
            logEvent("error", "watermark_remover.gemini_download_failed", {
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    const status = describeStatus();
    const searchBox =
        picked === null || box === null
            ? null
            : toPixelBox(box, { width: picked.facts.width, height: picked.facts.height });

    const cornerItems: Record<string, ReactNode> = Object.fromEntries(
        BOX_CORNERS.map((item) => [item, t(`corners.${item}`)]),
    );

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex min-w-0 flex-col gap-2">
                <input
                    id={inputId}
                    type="file"
                    accept={GEMINI_ACCEPT_ATTRIBUTE}
                    disabled={busy}
                    aria-describedby={hintId}
                    onChange={(event) => void handlePick(event.target.files?.[0])}
                    // Focusable but not laid out, so the label below can be the
                    // whole target while the keyboard still reaches it.
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
                        "border-border/80 bg-card/40 hover:border-primary/50 peer-focus-visible:ring-ring flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors duration-200 peer-focus-visible:ring-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                        dragging &&
                            "border-primary/70 bg-[color-mix(in_oklch,var(--primary)_6%,transparent)]",
                    )}
                >
                    <IconPhotoPlus
                        className="text-muted-foreground size-7"
                        stroke={1.6}
                        aria-hidden="true"
                    />
                    <span className="text-[0.9375rem] leading-[1.4] font-medium">
                        {t("dropTitle")}
                    </span>
                    <span className="text-muted-foreground text-[0.8125rem] leading-normal">
                        {t("dropHint", { limit: byteLabel(MAX_GEMINI_IMAGE_BYTES) })}
                    </span>
                </label>

                {picked !== null && (
                    <p className="text-muted-foreground min-w-0 truncate font-mono text-[0.6875rem] leading-normal tabular-nums">
                        {t("sourceFacts", {
                            name: picked.facts.name,
                            size: byteLabel(picked.facts.bytes),
                            width: formatter.number(picked.facts.width),
                            height: formatter.number(picked.facts.height),
                        })}
                    </p>
                )}

                <StatusStrip id={hintId} tone={status.tone} message={status.message} />

                <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                    {t("autoHint")}
                </p>
            </div>

            {picked !== null && box !== null && (
                <div className="flex min-w-0 flex-col gap-3">
                    <WatermarkBoxEditor
                        size={{ width: picked.facts.width, height: picked.facts.height }}
                        box={box}
                        disabled={working}
                        label={t("boxLabel")}
                        describedById={boxHintId}
                        corner={corner}
                        onBoxChange={setBox}
                    >
                        {/*
                            A plain `<img>`, deliberately: the source is an
                            object URL for a file the reader just chose, so
                            there is no remote loader to configure and nothing
                            for `next/image` to optimise.
                        */}
                        <img
                            src={picked.url}
                            alt={t("previewAlt", { name: picked.facts.name })}
                            decoding="async"
                            className="block h-auto w-full"
                        />
                    </WatermarkBoxEditor>

                    {result !== null && (
                        <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                            {t("foundIn", { corner: t(`corners.${result.image.corner}`) })}
                        </p>
                    )}

                    <p
                        id={boxHintId}
                        className="text-muted-foreground text-[0.6875rem] leading-normal"
                    >
                        {t("boxHint")}
                    </p>

                    {searchBox !== null && (
                        <p className="text-muted-foreground font-mono text-[0.6875rem] leading-normal tabular-nums">
                            {t("boxReadout", {
                                width: formatter.number(searchBox.width),
                                height: formatter.number(searchBox.height),
                                x: formatter.number(searchBox.x),
                                y: formatter.number(searchBox.y),
                            })}
                        </p>
                    )}

                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <Label id={cornerId} className="text-[0.8125rem] font-medium">
                                {t("cornerLabel")}
                            </Label>
                            <Select
                                items={cornerItems}
                                value={corner}
                                onValueChange={(next) => {
                                    if (typeof next === "string" && isBoxCorner(next)) {
                                        handleCornerChange(next);
                                    }
                                }}
                            >
                                <SelectTrigger
                                    aria-labelledby={cornerId}
                                    disabled={working}
                                    className="h-8 w-auto gap-1.5 px-2.5 text-[0.8125rem]"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BOX_CORNERS.map((item) => (
                                        <SelectItem key={item} value={item}>
                                            {t(`corners.${item}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            variant="outline"
                            disabled={working}
                            onClick={() => handleCornerChange(corner)}
                            className="h-8 shrink-0 px-3 text-[0.8125rem]"
                        >
                            <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
                            {t("resetBox")}
                        </Button>
                    </div>

                    <div className="flex min-w-0 items-center gap-2">
                        <Switch
                            checked={fillWholeBox}
                            disabled={working}
                            onCheckedChange={handleFillChange}
                            aria-labelledby={fillId}
                            aria-describedby={`${fillId}-hint`}
                        />
                        <span id={fillId} className="text-[0.8125rem] leading-[1.3] font-medium">
                            {t("fillWholeBox")}
                        </span>
                    </div>

                    <p
                        id={`${fillId}-hint`}
                        className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal"
                    >
                        {t("fillWholeBoxHint")}
                    </p>
                </div>
            )}

            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                    onClick={() => void handleRemove()}
                    disabled={!canRemove}
                    className="h-9 px-3.5"
                >
                    {working ? (
                        <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <IconEraser className="size-4" stroke={1.9} aria-hidden="true" />
                    )}
                    {working ? t("working") : t("remove")}
                </Button>

                <Button
                    variant="outline"
                    onClick={handleClear}
                    disabled={picked === null || busy}
                    className="h-9 px-3.5"
                >
                    <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                    {t("clear")}
                </Button>
            </div>

            {result !== null && (
                <div
                    ref={resultRef}
                    className={cn("min-w-0 transition-opacity duration-200", stale && "opacity-55")}
                >
                    <CleanedResult
                        beforeUrl={result.beforeUrl}
                        afterUrl={result.url}
                        facts={result.facts}
                        resultBytes={result.image.bytes}
                        note={t("resultNote")}
                        onDownload={() => handleDownload(result)}
                    />
                </div>
            )}

            {/*
             * Stated in the tool, not only in the article underneath: this
             * rebuilds one corner of somebody's picture, and the reader is the
             * only one who can know whether they hold the rights to it.
             */}
            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                {t("rightsNote")}
            </p>

            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                {t("privacyNote")}
            </p>
        </div>
    );
}
