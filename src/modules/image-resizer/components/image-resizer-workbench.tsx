"use client";

import {
    IconArrowBackUp,
    IconCheck,
    IconCrop,
    IconDownload,
    IconFileZip,
    IconFlipHorizontal,
    IconFlipVertical,
    IconFocusCentered,
    IconInfoCircle,
    IconLink,
    IconLoader2,
    IconMaximize,
    IconMinus,
    IconPlus,
    IconRefresh,
    IconRotate,
    IconRotateClockwise,
    IconShieldCheck,
    IconTrash,
    IconUnlink,
    IconX,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageDropzone } from "@/modules/tools/components/image-dropzone";
import { ImageQueueHeader } from "@/modules/tools/components/image-queue";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { ToolNotes } from "@/modules/tools/components/tool-notes";
import { buildZipArchive } from "@/modules/tools/domain/archive";
import { uniqueFilenames } from "@/modules/tools/domain/filenames";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { decodeToPixels } from "@/modules/tools/domain/image-codec";
import {
    knownPixelSize,
    readImagePixelSize,
    type ImagePixelSize,
} from "@/modules/tools/domain/image-element";
import { isOpaque } from "@/modules/tools/domain/pixels";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import type { PixelSize } from "@/modules/tools/types";

import {
    cropRatio,
    formatRatio,
    parseAspectText,
    ratioForPreset,
    reduceRatio,
} from "../domain/aspect";
import {
    DPI_PRESETS,
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FILE_LIMITS,
    MAX_FILES,
    MAX_IMAGE_BYTES,
    MAX_OUTPUT_PIXELS,
    MAX_PERCENTAGE,
    MAX_PIXELS,
    MAX_QUALITY,
    MAX_ZOOM,
    MIN_PERCENTAGE,
    MIN_QUALITY,
    MIN_ZOOM,
    DEFAULT_ZOOM,
    ZOOM_STEP,
} from "../domain/constants";
import { applyRatio, batchCrop, centeredCrop, fullCrop, isFullCrop } from "../domain/crop";
import { densityApplies } from "../domain/density";
import { buildArchiveFilename, buildOutputFilename } from "../domain/filenames";
import {
    backgroundApplies,
    clampDpi,
    clampPercentage,
    clampQuality,
    clampZoom,
    qualityApplies,
    resolveFormat,
    supportsAlpha,
} from "../domain/options";
import {
    MAX_ANGLE,
    MIN_ANGLE,
    flipPixels,
    normalizeAngle,
    rotatePixels,
    rotateQuarterTurns,
    rotatedSize,
} from "../domain/orient";
import { copiesPixels, planRender } from "../domain/plan";
import { findPreset, presetDpi } from "../domain/presets";
import { pixelsToPreviewBlob, renderImage } from "../domain/render";
import { fromPixels, isPhysicalUnit, roundForUnit, toPixels } from "../domain/units";
import {
    ASPECT_PRESETS,
    BACKGROUND_KINDS,
    FIT_MODES,
    LENGTH_UNITS,
    OUTPUT_FORMATS,
    RESIZE_MODES,
    type AspectPreset,
    type BackgroundKind,
    type CropRect,
    type FitMode,
    type FlipAxis,
    type LengthUnit,
    type OutputFormat,
    type ResizedImage,
    type ResizeFailureReason,
    type ResizeMode,
    type ResizeOptions,
    type ResizeResult,
    type RgbaImage,
} from "../types";
import { cropPixels } from "../domain/compose";
import { BatchRow } from "./batch-row";
import { CropCanvas } from "./crop-canvas";
import { OutputPreview } from "./output-preview";
import { PresetPicker } from "./preset-picker";

/**
 * One picked file. Only the file is kept: a batch is decoded one picture at a
 * time when it is exported, never all at once when it is picked.
 */
type BatchItem = {
    readonly id: string;
    readonly file: File;
    readonly previewUrl: string;
    /** Measured once after the pick; `null` until then, or if it would not decode. */
    readonly dimensions: ImagePixelSize | null;
    readonly working: boolean;
    /** Why the last render of this picture failed, cleared when it is tried again. */
    readonly reason: ResizeFailureReason | null;
};

/** One picture, decoded once and kept, because every export re-reads it. */
type Loaded = {
    /** The `BatchItem` this was decoded from. */
    readonly id: string;
    readonly file: File;
    readonly previewUrl: string;
    readonly pixels: RgbaImage;
    readonly size: PixelSize;
    /**
     * Scanned once, on load, rather than per render: it decides whether the
     * background colour is doing anything, and one translucent pixel in forty
     * megapixels is the difference between a right answer and a wrong one.
     */
    readonly hasAlpha: boolean;
};

/** What the frame needs to preview a picture, which a batch row has without decoding. */
type Framed = Pick<Loaded, "file" | "previewUrl" | "size">;

const MODE_LABEL_KEY = {
    dimensions: "modeDimensions",
    percentage: "modePercentage",
    preset: "modePreset",
} as const satisfies Record<ResizeMode, string>;

const UNIT_LABEL_KEY = {
    px: "unitPx",
    in: "unitIn",
    cm: "unitCm",
    mm: "unitMm",
} as const satisfies Record<LengthUnit, string>;

const FIT_LABEL_KEY = {
    contain: "fitContain",
    cover: "fitCover",
    stretch: "fitStretch",
} as const satisfies Record<FitMode, string>;

const FIT_HINT_KEY = {
    contain: "fitHintContain",
    cover: "fitHintCover",
    stretch: "fitHintStretch",
} as const satisfies Record<FitMode, string>;

const BACKGROUND_LABEL_KEY = {
    transparent: "backgroundTransparent",
    color: "backgroundColor",
} as const satisfies Record<BackgroundKind, string>;

const DPI_VALUES = DPI_PRESETS.map(String);

/**
 * A square, icon-only press — the rotate-and-flip row, and the two either side
 * of the zoom slider.
 *
 * Icon-only so five of them fit on a phone under the picture, and so a slider in
 * a 20 rem column keeps room to drag. That puts the whole meaning in the label,
 * which is therefore given twice: as `aria-label` for anyone not looking at it,
 * and as `title` for a pointer hovering a glyph it cannot read. Neither is
 * optional here.
 */
function IconPress({
    label,
    disabled,
    onClick,
    children,
    className,
}: {
    label: string;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
    className?: string;
}) {
    return (
        <Button
            variant="outline"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cn("size-8 shrink-0 p-0", className)}
        >
            {children}
        </Button>
    );
}

type ImageResizerWorkbenchProps = {
    /** Parsed from the search params on the server, so a shared link opens ready. */
    readonly initialOptions: ResizeOptions;
    /** Whether this deployment can fetch a picture by its address at all. */
    readonly urlImportEnabled: boolean;
};

export function ImageResizerWorkbench({
    initialOptions,
    urlImportEnabled,
}: ImageResizerWorkbenchProps) {
    const t = useTranslations("imageResizer.workbench");
    const tFormats = useTranslations("imageResizer.formats");
    const tErrors = useTranslations("imageResizer.errors");
    const tToast = useTranslations("imageResizer.toast");
    const format = useFormatter();
    const byteLabel = useByteLabel();

    const inputId = useId();
    const hintId = useId();
    const widthId = useId();
    const heightId = useId();
    const percentId = useId();
    const qualityId = useId();
    const colorId = useId();
    const zoomId = useId();
    const ratioTextId = useId();
    const transformId = useId();
    const angleId = useId();
    const angleHintId = useId();
    const queueHeadingId = useId();

    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
    /**
     * The box the reader last chose *by hand*, and the reference every ratio is
     * derived from.
     *
     * Without it, switching the shape picker derives each shape from the shape
     * the previous switch produced: 1:1 then 4:3 then 1:1 fits a box inside a
     * box inside a box, and the selection ratchets away to nothing. Deriving
     * from here instead means the round trip is exact — the two 1:1 boxes are
     * computed from the same rectangle, so they *are* the same rectangle.
     *
     * It follows a drag, a Select all, a Centre, an applied crop and an undo,
     * because every one of those is the reader saying where the box goes. It
     * deliberately does not follow a ratio switch, which is the whole point.
     */
    const [cropAnchor, setCropAnchor] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
    const [aspect, setAspect] = useState<AspectPreset>("free");
    const [customRatio, setCustomRatio] = useState("");
    /**
     * The free-angle field, kept as text so a half-typed `-` or an empty box is
     * a state the reader can be in rather than a zero that appeared under them.
     */
    const [angleText, setAngleText] = useState("");
    const [options, setOptions] = useState<ResizeOptions>(initialOptions);
    const [working, setWorking] = useState(false);
    const [reason, setReason] = useState<ResizeFailureReason | null>(null);
    /**
     * The crop tool is opt-in.
     *
     * A picture arrives as a picture: the frame shows what the settings would
     * produce, and nothing is asking to be dragged. Handles and a scrim over a
     * photograph nobody has decided to cut yet read as a demand rather than an
     * offer — and they cover the thing being previewed.
     */
    const [cropping, setCropping] = useState(false);
    /**
     * Every earlier version of the picture, newest last.
     *
     * A crop is applied **in place** rather than previewed beside the original:
     * the frame shows the picture as it now is, and the next crop is taken from
     * that. Which is only a safe thing to offer because the step is reversible,
     * and this is what reverses it — the whole `Loaded`, so undoing restores the
     * pixels rather than re-deriving them from a rectangle that no longer means
     * anything against the current frame.
     */
    const [history, setHistory] = useState<readonly Loaded[]>([]);
    /**
     * Every picked file. One of them is the editor's picture; two or more make
     * a batch, which shares every setting and none of the hand edits.
     */
    const [items, setItems] = useState<readonly BatchItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    // Ids come from a counter rather than `crypto.randomUUID`, so nothing in
    // this component is a per-render source of entropy.
    const nextId = useRef(0);

    // Held outside state because the cleanup must see every URL ever handed
    // out, including ones created after the last render this effect closed over.
    const objectUrls = useRef(new Set<string>());

    useEffect(() => {
        const urls = objectUrls.current;

        return () => {
            for (const url of urls) {
                URL.revokeObjectURL(url);
            }

            urls.clear();
        };
    }, []);

    const batch = items.length > 1;
    const selected = batch ? (items.find((item) => item.id === selectedId) ?? items[0]) : undefined;
    /**
     * What the frame shows. One picture is the decoded, editable one, as it
     * always was. In a batch it is the selected row — its edited pixels if it
     * is the picture that was open before the others joined, otherwise the
     * file as picked, previewed by layout alone with nothing decoded.
     */
    const frame: Framed | null = !batch
        ? loaded
        : selected === undefined
          ? null
          : loaded?.id === selected.id
            ? loaded
            : selected.dimensions === null
              ? null
              : { file: selected.file, previewUrl: selected.previewUrl, size: selected.dimensions };
    const sourceType = frame?.file.type ?? "";
    const outputFormat = resolveFormat(sourceType, options.format);
    const customShape = parseAspectText(customRatio);
    // A batch has no hand-placed box, so the shape lock is its whole crop.
    const frameCrop = batch && frame !== null ? batchCrop(frame.size, aspect, customShape) : crop;
    // Derived during render from pure functions, so the numbers under the
    // controls are never a frame behind the controls themselves.
    const plan = frame === null ? null : planRender(frameCrop, options);
    const output = plan?.canvas ?? { width: 0, height: 0 };
    const ratio = ratioForPreset(aspect, frame?.size ?? { width: 1, height: 1 }, customShape);
    const customInvalid = aspect === "custom" && customRatio.trim() !== "" && ratio === null;
    /**
     * Under `original` one batch can write several formats — a JPEG stays a
     * JPEG and a PNG stays a PNG — so a control stays live while it applies to
     * any picture in the batch, not only to the one in the frame.
     */
    const formats = batch
        ? items.map((item) => resolveFormat(item.file.type, options.format))
        : [outputFormat];
    const densityAvailable = formats.some(densityApplies);
    const qualityLive = formats.some(qualityApplies);
    // Nothing in a batch is decoded before the press, so neither its
    // transparency nor every picture's shape is known — and an unknown leaves
    // the control live rather than dead.
    const backgroundLive =
        batch || backgroundApplies(options.fit, outputFormat, loaded?.hasAlpha ?? false);
    const fitMatters =
        batch ||
        (plan !== null &&
            (plan.clips ||
                plan.draw.width !== plan.canvas.width ||
                plan.draw.height !== plan.canvas.height));
    const totalBytes = items.reduce((total, item) => total + item.file.size, 0);

    // Cropping to the whole frame would replace the picture with itself, so
    // the button says so by going dead rather than by doing nothing.
    const cropChangesSomething = loaded !== null && !isFullCrop(crop, loaded.size);

    /**
     * What the free-angle field currently means, in four separate states rather
     * than one boolean, because they call for four different sentences.
     *
     * An empty box is not an error — nothing has been asked for yet. A number
     * past a full turn is. `360` is neither: it parses, it is in range, and it
     * would hand back the picture unchanged, so the button goes dead the same
     * way it does for a crop of the whole frame.
     */
    const typedAngle = angleText.trim() === "" ? null : Number(angleText);
    const angleInRange =
        typedAngle !== null &&
        Number.isFinite(typedAngle) &&
        typedAngle >= MIN_ANGLE &&
        typedAngle <= MAX_ANGLE;
    const angleInvalid = typedAngle !== null && !angleInRange;
    const angleTurns = angleInRange && normalizeAngle(typedAngle) !== 0;
    /**
     * A free angle grows the canvas to fit the corners, so a 40 MP picture at
     * 45° asks for 57 MP — past the ceiling the decoder itself enforces.
     * Checked before the press rather than after, because "after" is the tab
     * the reader was working in.
     */
    const angleOutput = angleTurns && loaded !== null ? rotatedSize(loaded.size, typedAngle) : null;
    const angleTooLarge =
        angleOutput !== null && angleOutput.width * angleOutput.height > MAX_PIXELS;
    /**
     * The settings panel is closed while the crop tool is open.
     *
     * Not tidiness: out of the tool the frame *is* the output, so every control
     * on the right is answered by the picture in front of the reader. Inside it
     * the frame is the source with a box on it, and the same controls would be
     * changing a result nothing on screen is showing — a slider whose effect is
     * invisible until two presses later is worse than a slider that is plainly
     * not available yet.
     *
     * Disabled per control rather than by hiding the panel: the reader can still
     * read what is set, and the note above it says how to get back.
     */
    const settingsLocked = working || cropping;

    /** A box the reader placed: it becomes the crop *and* the new reference. */
    function placeCrop(next: CropRect) {
        setCrop(next);
        setCropAnchor(next);
    }

    function patch(next: Partial<ResizeOptions>) {
        setOptions((current) => ({ ...current, ...next }));
    }

    /**
     * Steps the zoom, from the value in state rather than from the last press.
     *
     * Snapped onto the step grid first, so a 137% left behind by a drag walks to
     * 140 and 135 rather than to 142 and 132 — a stepper that inherits an
     * off-grid remainder never lands on a round number again. Snapped *towards*
     * the press, so neither button ever moves more than one step.
     */
    function nudgeZoom(by: number) {
        const grid =
            by > 0
                ? Math.floor(options.zoom / ZOOM_STEP) * ZOOM_STEP
                : Math.ceil(options.zoom / ZOOM_STEP) * ZOOM_STEP;

        patch({ zoom: clampZoom(grid + by) });
    }

    function describeFailure(value: ResizeFailureReason): string {
        switch (value) {
            case "empty_file":
                return tErrors("empty_file");
            case "unsupported_type":
                return tErrors("unsupported_type");
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_IMAGE_BYTES) });
            case "too_many_files":
                return tErrors("too_many_files", { count: format.number(MAX_FILES) });
            case "too_many_pixels":
                return tErrors("too_many_pixels", {
                    count: format.number(Math.round(MAX_PIXELS / 1_000_000)),
                });
            case "undecodable":
                return tErrors("undecodable");
            case "empty_crop":
                return tErrors("empty_crop");
            case "output_too_large":
                return tErrors("output_too_large", {
                    count: format.number(Math.round(MAX_OUTPUT_PIXELS / 1_000_000)),
                });
            case "encode_failed":
                return tErrors("encode_failed");
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (working && progress.total > 0) {
            return {
                tone: "pending",
                message: t("statusBatchWorking", {
                    done: format.number(progress.done + 1),
                    total: format.number(progress.total),
                }),
            };
        }

        if (working) {
            return { tone: "pending", message: t("statusWorking") };
        }

        if (reason !== null) {
            return { tone: "error", message: describeFailure(reason) };
        }

        if (batch) {
            const failed = items.filter((item) => item.reason !== null).length;

            return failed > 0
                ? { tone: "warning", message: t("statusBatchFailed", { count: failed }) }
                : { tone: "idle", message: t("statusBatchReady", { count: items.length }) };
        }

        if (loaded === null) {
            return { tone: "idle", message: t("statusIdle") };
        }

        if (history.length > 0 && !cropChangesSomething) {
            return {
                tone: "success",
                message: t("statusCropped", {
                    width: format.number(loaded.size.width),
                    height: format.number(loaded.size.height),
                }),
            };
        }

        return {
            tone: "idle",
            message: t("statusReady", {
                width: format.number(crop.width),
                height: format.number(crop.height),
            }),
        };
    }

    function releaseUrl(url: string | null) {
        if (url !== null) {
            URL.revokeObjectURL(url);
            objectUrls.current.delete(url);
        }
    }

    /** Drops the undo stack and the preview URLs only it was still holding. */
    function clearHistory() {
        for (const step of history) {
            releaseUrl(step.previewUrl);
        }

        setHistory([]);
    }

    /** A row for a picked file, with its own thumbnail URL. */
    function createItem(file: File): BatchItem {
        const previewUrl = URL.createObjectURL(file);

        objectUrls.current.add(previewUrl);

        return {
            id: `item-${(nextId.current += 1)}`,
            file,
            previewUrl,
            dimensions: null,
            working: false,
            reason: null,
        };
    }

    /**
     * Every pick adds to what is loaded, up to `MAX_FILES`.
     *
     * The first picture opens in the editor exactly as it always has. A second
     * turns the page into a batch — one set of settings for all of them — and
     * Start over is what replaces rather than adds.
     */
    function handlePick(picked: readonly File[]) {
        if (working) {
            return;
        }

        const room = Math.max(0, MAX_FILES - items.length);
        const accepted = picked.slice(0, room);

        if (picked.length > accepted.length) {
            toast.error(describeFailure("too_many_files"));
        }

        const added: BatchItem[] = [];
        const refused: ResizeFailureReason[] = [];

        for (const file of accepted) {
            const checked = checkImageFile(file, IMAGE_FILE_LIMITS);

            if (checked.ok) {
                added.push(createItem(file));
            } else {
                refused.push(checked.reason);
            }
        }

        const [onlyRefusal] = refused;

        // A lone file keeps its own sentence, as it always did; a batch is counted.
        if (accepted.length === 1 && onlyRefusal !== undefined) {
            setReason(onlyRefusal);
            toast.error(describeFailure(onlyRefusal));
        } else if (refused.length > 0) {
            toast.error(tToast("rejected", { count: refused.length }));
        }

        const [first] = added;

        if (first === undefined) {
            return;
        }

        setItems([...items, ...added]);
        measure(added);

        if (items.length === 0 && added.length === 1) {
            void decodeItem(first);

            return;
        }

        // The crop tool works on one picture, so joining a batch closes it the
        // way Cancel does.
        if (cropping) {
            stopCropping();
        }

        setReason(null);
    }

    /**
     * Reads each new picture's pixel size once, after it is already listed, so
     * the row appears the moment the file is picked and its size follows. A
     * row removed in the meantime is simply not found.
     */
    function measure(added: readonly BatchItem[]) {
        for (const item of added) {
            void readImagePixelSize(item.previewUrl).then((size) => {
                setItems((current) =>
                    replaceItem(current, item.id, { dimensions: knownPixelSize(size) }),
                );
            });
        }
    }

    /** A picture that will not open is refused outright, as a single pick always was. */
    function refuseItem(item: BatchItem, why: ResizeFailureReason) {
        releaseUrl(item.previewUrl);
        setItems((current) => current.filter((candidate) => candidate.id !== item.id));
        setReason(why);
        toast.error(describeFailure(why));
    }

    /**
     * Decodes a picture into the editor: the first one picked, or the one left
     * when a batch is cut back down to one. The caller has already let go of
     * whatever was loaded before.
     */
    async function decodeItem(item: BatchItem) {
        setWorking(true);
        setReason(null);

        try {
            const pixels = await decodeToPixels(item.file);

            if (pixels === null) {
                refuseItem(item, "undecodable");

                return;
            }

            if (pixels.width * pixels.height > MAX_PIXELS) {
                refuseItem(item, "too_many_pixels");

                return;
            }

            const previewUrl = URL.createObjectURL(item.file);

            objectUrls.current.add(previewUrl);

            const size = { width: pixels.width, height: pixels.height };

            setLoaded({
                id: item.id,
                file: item.file,
                previewUrl,
                pixels,
                size,
                hasAlpha: !isOpaque(pixels),
            });
            // A fresh picture opens as a picture, not as a crop in progress.
            setCropping(false);
            placeCrop(fullCrop(size));
        } catch (caught) {
            logEvent("error", "image_resizer.decode_threw", { error: describeError(caught) });
            refuseItem(item, "undecodable");
        } finally {
            setWorking(false);
        }
    }

    function handleRemove(id: string) {
        const target = items.find((item) => item.id === id);

        if (target === undefined || working) {
            return;
        }

        const rest = items.filter((item) => item.id !== id);

        releaseUrl(target.previewUrl);
        setItems(rest);

        if (loaded?.id === id) {
            releaseUrl(loaded.previewUrl);
            clearHistory();
            setLoaded(null);
        }

        const [only] = rest;

        // Back to one picture: it opens in the editor, the way a single pick does.
        if (rest.length === 1 && only !== undefined && loaded?.id !== only.id) {
            void decodeItem(only);
        }
    }

    function selectAspect(next: AspectPreset) {
        setAspect(next);

        if (loaded === null) {
            return;
        }

        const nextRatio = ratioForPreset(next, loaded.size, parseAspectText(customRatio));

        // From the anchor, never from `crop` — see `cropAnchor`.
        setCrop(applyRatio(cropAnchor, nextRatio, loaded.size));
    }

    function selectCustomRatio(text: string) {
        setCustomRatio(text);

        const parsed = parseAspectText(text);

        if (loaded !== null && parsed !== null && aspect === "custom") {
            setCrop(applyRatio(cropAnchor, parsed.width / parsed.height, loaded.size));
        }
    }

    /**
     * Typing one side fills in the other while the lock is on.
     *
     * Deliberately **not** debounced: the field the reader is not typing in is
     * controlled by this derivation, and a debounce there reverts keystrokes
     * 300 ms after they land. The arithmetic is two divisions — there is
     * nothing here worth waiting for. See `CLAUDE.md` decision 42.
     */
    function setDimension(side: "width" | "height", raw: string) {
        const parsed = raw.trim() === "" ? null : Number(raw);
        const value = parsed === null || !Number.isFinite(parsed) ? null : parsed;

        // In a batch the linked side is left blank rather than filled in from
        // the picture in the frame: blank is what lets every picture keep its
        // own shape, where a number would force all of them into this one's.
        if (batch && options.lockAspect) {
            patch(
                side === "width" ? { width: value, height: null } : { height: value, width: null },
            );

            return;
        }

        if (!options.lockAspect || value === null || frame === null) {
            patch({ [side]: value });

            return;
        }

        const shape = cropRatio(frameCrop);
        const pixels = toPixels(value, options.unit, options.dpi);
        const otherPixels = side === "width" ? pixels / shape : pixels * shape;
        const other = roundForUnit(
            fromPixels(otherPixels, options.unit, options.dpi),
            options.unit,
        );

        patch(side === "width" ? { width: value, height: other } : { height: value, width: other });
    }

    function selectUnit(next: LengthUnit) {
        // The numbers already typed are re-expressed in the new unit rather
        // than reinterpreted: switching from millimetres to inches must not
        // turn a 45 mm photograph into a 45 inch one.
        if (options.width === null && options.height === null) {
            patch({ unit: next });

            return;
        }

        const convert = (value: number | null) =>
            value === null
                ? null
                : roundForUnit(
                      fromPixels(toPixels(value, options.unit, options.dpi), next, options.dpi),
                      next,
                  );

        patch({ unit: next, width: convert(options.width), height: convert(options.height) });
    }

    function selectPreset(presetId: string) {
        const preset = findPreset(presetId);
        const dpi = preset === null ? null : presetDpi(preset.size);

        patch({
            presetId,
            // A document preset carries the resolution it is defined at, and
            // a reader who picks "Bangladesh passport" means 300 DPI unless
            // they then say otherwise.
            ...(dpi === null ? {} : { dpi }),
            ...(preset?.fit === undefined ? {} : { fit: preset.fit }),
        });
    }

    /**
     * Replaces the picture in the frame with a new set of pixels, reversibly.
     *
     * Cropping, turning and mirroring are one edit from here. Each changes the
     * picture **in place** rather than producing a copy beside it: the frame
     * shows what the reader now has, the box resets to all of it, and the next
     * edit is taken from this one. Which is only safe to offer because the step
     * reverses — the whole previous `Loaded` goes on the undo stack, pixels and
     * all, because a rectangle means nothing against a frame that has since
     * changed shape.
     *
     * Nothing is encoded for the file here. The preview is a throwaway PNG from
     * the browser's own writer, and `pixels` stays the source of truth, so four
     * edits cost four canvas writes rather than four trips through OxiPNG — and
     * the export still runs once, from the pixels, at the quality asked for.
     */
    async function replacePixels(
        produce: () => RgbaImage,
        event: string,
        describe: (size: PixelSize) => string,
    ) {
        if (loaded === null || working) {
            return;
        }

        setWorking(true);
        setReason(null);

        try {
            const next = produce();
            const blob = await pixelsToPreviewBlob(next);

            if (blob === null) {
                setReason("encode_failed");

                return;
            }

            const previewUrl = URL.createObjectURL(blob);

            objectUrls.current.add(previewUrl);

            const size = { width: next.width, height: next.height };

            setHistory([...history, loaded]);
            setLoaded({ ...loaded, previewUrl, pixels: next, size, hasAlpha: !isOpaque(next) });
            placeCrop(fullCrop(size));
            // The crop tool closes on apply: the frame is now the cropped
            // picture, and leaving a box over it would invite a second cut
            // nobody asked for while hiding the result of the first.
            setCropping(false);
            toast.success(describe(size));
        } catch (caught) {
            logEvent("error", event, { error: describeError(caught) });
            setReason("encode_failed");
        } finally {
            setWorking(false);
        }
    }

    async function handleApplyCrop() {
        if (loaded === null || !cropChangesSomething) {
            return;
        }

        const pixels = loaded.pixels;

        await replacePixels(
            () => cropPixels(pixels, crop),
            "image_resizer.crop_threw",
            (size) =>
                tToast("cropped", {
                    width: format.number(size.width),
                    height: format.number(size.height),
                }),
        );
    }

    /**
     * A quarter turn or a mirror — the transforms that move bytes without
     * touching them.
     *
     * The toast names the new size because a quarter turn swaps the sides, and
     * a portrait that has just become a landscape is worth reading rather than
     * inferring from the frame.
     */
    async function handleQuarterTurn(turns: number) {
        if (loaded === null) {
            return;
        }

        const pixels = loaded.pixels;

        await replacePixels(
            () => rotateQuarterTurns(pixels, turns),
            "image_resizer.rotate_threw",
            (size) =>
                tToast("rotated", {
                    width: format.number(size.width),
                    height: format.number(size.height),
                }),
        );
    }

    async function handleFlip(axis: FlipAxis) {
        if (loaded === null) {
            return;
        }

        const pixels = loaded.pixels;

        await replacePixels(
            () => flipPixels(pixels, axis),
            "image_resizer.flip_threw",
            () => tToast(axis === "horizontal" ? "flippedHorizontal" : "flippedVertical"),
        );
    }

    /**
     * The free angle, which is the one transform here that is not exact.
     *
     * Refused rather than attempted when the rotated box would pass the
     * decoder's own ceiling: the canvas grows to fit the corners, so an angle
     * near 45° asks for around 1.4 times the pixels it started with.
     */
    async function handleFreeRotate() {
        if (loaded === null || typedAngle === null || !angleTurns) {
            return;
        }

        if (angleTooLarge) {
            setReason("too_many_pixels");
            toast.error(describeFailure("too_many_pixels"));

            return;
        }

        const pixels = loaded.pixels;
        const angle = typedAngle;

        await replacePixels(
            () => rotatePixels(pixels, angle),
            "image_resizer.rotate_threw",
            (size) =>
                tToast("rotated", {
                    width: format.number(size.width),
                    height: format.number(size.height),
                }),
        );
    }

    // The latest closure over the crop and the picture, so the listener below
    // can be attached once per crop session rather than on every drag frame.
    const applyLatest = useRef(handleApplyCrop);

    useEffect(() => {
        applyLatest.current = handleApplyCrop;
    });

    /**
     * Enter applies the crop from anywhere on the page while the tool is open.
     *
     * Scoped twice, and both scopes matter. It is only bound **while cropping**,
     * so Enter means nothing on a page that is only previewing. And it stands
     * down for anything editable or pressable — the ratio field, the dimension
     * inputs, a focused button — where Enter already means submit-this, pick-
     * this, or press-this. `defaultPrevented` covers the crop box itself, which
     * handles its own Enter before this ever sees it.
     */
    useEffect(() => {
        if (!cropping) {
            return;
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== "Enter" || event.defaultPrevented) {
                return;
            }

            const target = event.target;

            if (
                target instanceof HTMLElement &&
                (target.isContentEditable ||
                    ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName))
            ) {
                return;
            }

            event.preventDefault();
            void applyLatest.current();
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [cropping]);

    function startCropping() {
        if (loaded === null || working) {
            return;
        }

        setCropping(true);
        // Opens on the whole frame under a free crop, or on the largest box of
        // the locked shape — so the first drag adjusts something real rather
        // than starting from a rectangle nobody chose.
        placeCrop(aspect === "free" ? fullCrop(loaded.size) : centeredCrop(loaded.size, ratio));
    }

    function stopCropping() {
        setCropping(false);

        if (loaded !== null) {
            // Leaving without applying puts the box back to the whole frame, so
            // the preview goes on meaning "the picture as it is".
            placeCrop(fullCrop(loaded.size));
        }
    }

    /** One step back up the stack, pixels and all. */
    function handleUndo() {
        const previous = history.at(-1);

        if (previous === undefined || working) {
            return;
        }

        if (loaded !== null) {
            releaseUrl(loaded.previewUrl);
        }

        setHistory(history.slice(0, -1));
        setLoaded(previous);
        placeCrop(fullCrop(previous.size));
        setCropping(false);
        setReason(null);
    }

    /**
     * Encodes the file and hands it to the browser, in one press.
     *
     * No result panel between the two. What is in the frame is what is being
     * exported — the resize is a scale of exactly those pixels, and the line
     * under the button already says the size it will come out at and whether
     * anything will be resampled. A preview of a picture the reader is looking
     * at is a step, not information.
     */
    async function handleExport() {
        if (loaded === null || working) {
            return;
        }

        setWorking(true);
        setReason(null);

        try {
            const rendered = await renderImage(loaded.pixels, loaded.file.type, crop, options);

            if (!rendered.ok) {
                setReason(rendered.reason);

                return;
            }

            const filename = buildOutputFilename(
                loaded.file.name,
                rendered.image.format,
                rendered.image.size,
            );

            saveBlob({ filename, blob: rendered.image.blob });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "image_resizer.render_threw", { error: describeError(caught) });
            setReason("encode_failed");
        } finally {
            setWorking(false);
        }
    }

    /**
     * One picture of a batch, decoded, rendered and let go again — so a batch
     * never holds more than one source picture at a time.
     *
     * The picture that was open in the editor before the others joined keeps
     * its applied crops and turns: those pixels are already in hand, and
     * dropping them would quietly undo work. Nothing else here is hand-edited.
     */
    async function renderItem(item: BatchItem): Promise<ResizeResult> {
        const pixels = loaded?.id === item.id ? loaded.pixels : await decodeToPixels(item.file);

        if (pixels === null) {
            return { ok: false, reason: "undecodable" };
        }

        if (pixels.width * pixels.height > MAX_PIXELS) {
            return { ok: false, reason: "too_many_pixels" };
        }

        const size = { width: pixels.width, height: pixels.height };

        return renderImage(pixels, item.file.type, batchCrop(size, aspect, customShape), options);
    }

    /**
     * Renders one row, marking it while it runs and recording why if it fails.
     * Caught per row rather than per run: one picture the decoder chokes on
     * should not abandon the nineteen behind it.
     */
    async function renderRow(item: BatchItem): Promise<ResizedImage | null> {
        setItems((current) => replaceItem(current, item.id, { working: true, reason: null }));

        const outcome = await renderItem(item).catch((caught: unknown) => {
            logEvent("error", "image_resizer.batch_render_threw", {
                error: describeError(caught),
            });

            return { ok: false, reason: "encode_failed" } as const;
        });

        if (!outcome.ok) {
            logEvent("warn", "image_resizer.batch_render_failed", { reason: outcome.reason });
        }

        setItems((current) =>
            replaceItem(current, item.id, {
                working: false,
                reason: outcome.ok ? null : outcome.reason,
            }),
        );

        return outcome.ok ? outcome.image : null;
    }

    /** One row's own download, under whatever the panel says right now. */
    async function handleDownloadOne(item: BatchItem) {
        if (working) {
            return;
        }

        setWorking(true);
        setReason(null);

        try {
            // `null` is a failure the row itself already shows.
            const image = await renderRow(item);

            if (image === null) {
                return;
            }

            const filename = buildOutputFilename(item.file.name, image.format, image.size);

            saveBlob({ filename, blob: image.blob });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "image_resizer.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        } finally {
            setWorking(false);
        }
    }

    /**
     * Every picture, one after another, into one ZIP.
     *
     * Each result is read into bytes as soon as it exists and its blob let go,
     * so the tab holds one copy of every finished file rather than two. A
     * picture that fails is left out of the archive and says why in its row.
     */
    async function handleDownloadAll() {
        if (working) {
            return;
        }

        setWorking(true);
        setReason(null);

        try {
            const finished: { name: string; bytes: Uint8Array<ArrayBuffer> }[] = [];

            for (const [index, item] of items.entries()) {
                setProgress({ done: index, total: items.length });

                const image = await renderRow(item);

                if (image !== null) {
                    finished.push({
                        name: buildOutputFilename(item.file.name, image.format, image.size),
                        bytes: new Uint8Array(await image.blob.arrayBuffer()),
                    });
                }
            }

            if (finished.length === 0) {
                return;
            }

            const names = uniqueFilenames(finished.map((entry) => entry.name));
            const stamp = new Date();
            const filename = buildArchiveFilename(stamp);
            const archive = buildZipArchive(
                finished.map((entry, index) => ({ name: names[index], bytes: entry.bytes })),
                stamp,
            );

            saveBlob({ filename, blob: new Blob([archive], { type: "application/zip" }) });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "image_resizer.archive_failed", { error: describeError(caught) });
            toast.error(tToast("archiveFailed"));
        } finally {
            setWorking(false);
            setProgress({ done: 0, total: 0 });
        }
    }

    function handleReset() {
        if (loaded !== null) {
            releaseUrl(loaded.previewUrl);
        }

        for (const item of items) {
            releaseUrl(item.previewUrl);
        }

        clearHistory();
        setItems([]);
        setSelectedId(null);
        setLoaded(null);
        setCropping(false);
        setReason(null);
    }

    const status = describeStatus();

    return (
        // `overflow-visible` overrides the vendor Card's own `overflow-hidden`,
        // and it is the whole reason the sticky column works: an ancestor whose
        // overflow is not `visible` becomes the sticky element's scroll
        // container, and a card that never scrolls gives `position: sticky`
        // nothing to slide against. The hairline below is inset rather than
        // clipped, which is all the hidden overflow was doing for it.
        <Card className="relative overflow-visible [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <div className="flex min-w-0 flex-col gap-2">
                    <ImageDropzone
                        inputId={inputId}
                        describedById={hintId}
                        multiple
                        compact={items.length > 0}
                        accept={IMAGE_ACCEPT_ATTRIBUTE}
                        disabled={working}
                        title={items.length > 0 ? t("dropMoreTitle") : t("dropTitle")}
                        hint={t("dropHint", {
                            limit: byteLabel(MAX_IMAGE_BYTES),
                            count: format.number(MAX_FILES),
                        })}
                        onFiles={handlePick}
                    />

                    <ImageSourceControls
                        onFiles={handlePick}
                        disabled={working}
                        urlImportEnabled={urlImportEnabled}
                    />

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                {batch && (
                    <section
                        aria-labelledby={queueHeadingId}
                        className="flex min-w-0 flex-col gap-2.5"
                    >
                        <ImageQueueHeader
                            id={queueHeadingId}
                            count={items.length}
                            totalBytes={totalBytes}
                        />

                        {/*
                         * Capped and scrolled: the frame and the settings are
                         * what this page is for, and twenty rows above them
                         * would push both below the fold.
                         */}
                        <ul className="flex max-h-80 min-w-0 flex-col gap-2 overflow-y-auto">
                            {items.map((item) => {
                                const own = loaded?.id === item.id ? loaded : null;

                                return (
                                    <BatchRow
                                        key={item.id}
                                        name={item.file.name}
                                        bytes={item.file.size}
                                        type={item.file.type}
                                        dimensions={own?.size ?? item.dimensions}
                                        previewUrl={own?.previewUrl ?? item.previewUrl}
                                        selected={item.id === selected?.id}
                                        working={item.working}
                                        failure={
                                            item.reason === null
                                                ? null
                                                : describeFailure(item.reason)
                                        }
                                        busy={working}
                                        onSelect={() => setSelectedId(item.id)}
                                        onDownload={() => void handleDownloadOne(item)}
                                        onRemove={() => handleRemove(item.id)}
                                    />
                                );
                            })}
                        </ul>
                    </section>
                )}

                {(loaded !== null || batch) && (
                    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                        {/*
                         * Sticky, and `self-start` is what makes that work: a
                         * grid item stretches to the row's height by default,
                         * which leaves nothing for `position: sticky` to slide
                         * against. The settings column is much the taller of the
                         * two, so without this the picture scrolls away from the
                         * controls that change it.
                         */}
                        <div className="flex min-w-0 flex-col gap-3 self-start lg:sticky lg:top-6">
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                <span className="text-[0.8125rem] leading-[1.3] font-medium">
                                    {cropping ? t("cropTitle") : t("previewTitle")}
                                </span>
                                <span className="text-muted-foreground font-mono text-[0.75rem] tabular-nums">
                                    {cropping
                                        ? t("cropReadout", {
                                              width: format.number(crop.width),
                                              height: format.number(crop.height),
                                              x: format.number(crop.x),
                                              y: format.number(crop.y),
                                          })
                                        : t("outputReadout", {
                                              width: format.number(output.width),
                                              height: format.number(output.height),
                                          })}
                                </span>
                            </div>
                            {cropping && loaded !== null ? (
                                <CropCanvas
                                    previewUrl={loaded.previewUrl}
                                    alt={t("previewAlt")}
                                    source={loaded.size}
                                    crop={crop}
                                    ratio={ratio}
                                    disabled={working}
                                    onChange={placeCrop}
                                    onCommit={() => void handleApplyCrop()}
                                />
                            ) : (
                                plan !== null &&
                                frame !== null && (
                                    <OutputPreview
                                        previewUrl={frame.previewUrl}
                                        alt={t("resultAlt")}
                                        source={frame.size}
                                        plan={plan}
                                    />
                                )
                            )}

                            {cropping && loaded !== null && (
                                <>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Button
                                            variant="outline"
                                            disabled={working}
                                            onClick={() => placeCrop(fullCrop(loaded.size))}
                                            className="h-8 px-3 text-[0.8125rem]"
                                        >
                                            <IconMaximize
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("cropReset")}
                                        </Button>

                                        <Button
                                            variant="outline"
                                            disabled={working}
                                            onClick={() =>
                                                placeCrop(centeredCrop(loaded.size, ratio))
                                            }
                                            className="h-8 px-3 text-[0.8125rem]"
                                        >
                                            <IconFocusCentered
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("cropCentre")}
                                        </Button>

                                        <span className="text-muted-foreground ml-auto text-[0.75rem] tabular-nums">
                                            {t("cropRatioReadout", {
                                                ratio: formatRatio(
                                                    reduceRatio(crop.width, crop.height),
                                                ),
                                            })}
                                        </span>
                                    </div>
                                </>
                            )}

                            {/*
                             * Beside the picture rather than in the settings
                             * column, and hidden while cropping. A turn is an
                             * edit to the picture in the frame, like a crop and
                             * unlike a setting — and doing it under an open crop
                             * box would move the box out from under the reader's
                             * pointer mid-drag. Hidden in a batch too, with the
                             * crop: a hand edit is to one picture, and the
                             * settings are the only thing a batch shares.
                             */}
                            {!cropping && !batch && (
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                        <span
                                            id={transformId}
                                            className="text-muted-foreground mr-0.5 text-xs leading-[1.3]"
                                        >
                                            {t("transformLabel")}
                                        </span>

                                        <div
                                            role="group"
                                            aria-labelledby={transformId}
                                            className="flex shrink-0 items-center gap-1.5"
                                        >
                                            <IconPress
                                                label={t("rotateLeft")}
                                                disabled={working}
                                                onClick={() => void handleQuarterTurn(3)}
                                            >
                                                <IconRotate
                                                    className="size-4"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                            </IconPress>

                                            <IconPress
                                                label={t("rotateRight")}
                                                disabled={working}
                                                onClick={() => void handleQuarterTurn(1)}
                                            >
                                                <IconRotateClockwise
                                                    className="size-4"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                            </IconPress>

                                            {/*
                                             * Spelt out rather than drawn. Two
                                             * curved arrows are already the two
                                             * buttons beside it, and a third
                                             * that means "both ways at once" is
                                             * a glyph nobody reads correctly.
                                             */}
                                            <Button
                                                variant="outline"
                                                aria-label={t("rotateHalf")}
                                                title={t("rotateHalf")}
                                                disabled={working}
                                                onClick={() => void handleQuarterTurn(2)}
                                                className="h-8 shrink-0 px-2 font-mono text-[0.6875rem] tabular-nums"
                                            >
                                                {t("rotateHalfShort")}
                                            </Button>

                                            <span
                                                aria-hidden="true"
                                                className="bg-border/70 mx-0.5 h-5 w-px shrink-0"
                                            />

                                            <IconPress
                                                label={t("flipHorizontal")}
                                                disabled={working}
                                                onClick={() => void handleFlip("horizontal")}
                                            >
                                                <IconFlipHorizontal
                                                    className="size-4"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                            </IconPress>

                                            <IconPress
                                                label={t("flipVertical")}
                                                disabled={working}
                                                onClick={() => void handleFlip("vertical")}
                                            >
                                                <IconFlipVertical
                                                    className="size-4"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                            </IconPress>
                                        </div>

                                        <div className="flex min-w-0 items-center gap-1.5 sm:ml-auto">
                                            <Label htmlFor={angleId} className="sr-only">
                                                {t("angleLabel")}
                                            </Label>
                                            <Input
                                                id={angleId}
                                                type="number"
                                                inputMode="numeric"
                                                min={MIN_ANGLE}
                                                max={MAX_ANGLE}
                                                value={angleText}
                                                placeholder={t("anglePlaceholder")}
                                                disabled={working}
                                                aria-invalid={angleInvalid ? true : undefined}
                                                // The line below, which is where
                                                // the refusal is rendered — not
                                                // the group heading, which
                                                // describes the row rather than
                                                // this field.
                                                aria-describedby={angleHintId}
                                                onChange={(event) =>
                                                    setAngleText(event.target.value)
                                                }
                                                className="h-8 w-20 min-w-0 font-mono text-[0.8125rem] tabular-nums"
                                            />
                                            {/*
                                             * A press rather than a live
                                             * derivation: a free angle is a full
                                             * resample of every pixel, and doing
                                             * one per keystroke would run four
                                             * of them on the way to `45`.
                                             */}
                                            <Button
                                                variant="outline"
                                                disabled={working || !angleTurns || angleTooLarge}
                                                onClick={() => void handleFreeRotate()}
                                                className="h-8 shrink-0 px-2.5 text-[0.8125rem]"
                                            >
                                                <IconRefresh
                                                    className="size-4"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                                {t("angleApply")}
                                            </Button>
                                        </div>
                                    </div>

                                    <p
                                        id={angleHintId}
                                        className={cn(
                                            "text-[0.6875rem] leading-[1.4]",
                                            angleInvalid || angleTooLarge
                                                ? "text-destructive"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {angleInvalid
                                            ? t("angleInvalid", {
                                                  min: format.number(MIN_ANGLE),
                                                  max: format.number(MAX_ANGLE),
                                              })
                                            : angleTooLarge
                                              ? t("angleTooLarge", {
                                                    count: format.number(
                                                        Math.round(MAX_PIXELS / 1_000_000),
                                                    ),
                                                })
                                              : angleOutput !== null
                                                ? t("angleHint", {
                                                      width: format.number(angleOutput.width),
                                                      height: format.number(angleOutput.height),
                                                  })
                                                : t("transformHint")}
                                    </p>
                                </div>
                            )}

                            {/*
                             * Directly under the picture rather than under the
                             * whole grid. The settings column is twice as tall,
                             * so a shared row at the bottom left the buttons
                             * marooned below a column of empty space — and the
                             * two presses a reader makes most are the two that
                             * were furthest from what they were looking at.
                             */}
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                {batch ? (
                                    <>
                                        <Button
                                            onClick={() => void handleDownloadAll()}
                                            disabled={working}
                                            className="h-9 px-3.5"
                                        >
                                            {working ? (
                                                <IconLoader2
                                                    className="size-4 animate-spin"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <IconFileZip
                                                    className="size-4"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {working && progress.total > 0
                                                ? t("downloadingAll", {
                                                      done: format.number(progress.done + 1),
                                                      total: format.number(progress.total),
                                                  })
                                                : t("downloadAll")}
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            onClick={handleReset}
                                            disabled={working}
                                            className="h-9 px-3"
                                        >
                                            <IconTrash
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("reset")}
                                        </Button>
                                    </>
                                ) : cropping ? (
                                    <>
                                        <Button
                                            onClick={() => void handleApplyCrop()}
                                            disabled={working || !cropChangesSomething}
                                            className="h-9 px-3.5"
                                        >
                                            {working ? (
                                                <IconLoader2
                                                    className="size-4 animate-spin"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <IconCheck
                                                    className="size-4"
                                                    stroke={1.9}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {t("applyCrop")}
                                        </Button>

                                        <Button
                                            variant="outline"
                                            onClick={stopCropping}
                                            disabled={working}
                                            className="h-9 px-3.5"
                                        >
                                            <IconX
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("cropCancel")}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            onClick={startCropping}
                                            disabled={working}
                                            className="h-9 px-3.5"
                                        >
                                            <IconCrop
                                                className="size-4"
                                                stroke={1.9}
                                                aria-hidden="true"
                                            />
                                            {t("cropStart")}
                                        </Button>

                                        <Button
                                            variant="outline"
                                            onClick={handleUndo}
                                            disabled={working || history.length === 0}
                                            className="h-9 px-3.5"
                                        >
                                            <IconArrowBackUp
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("undo")}
                                        </Button>

                                        <Button
                                            variant="outline"
                                            onClick={() => void handleExport()}
                                            disabled={working}
                                            className="h-9 px-3.5"
                                        >
                                            {working ? (
                                                <IconLoader2
                                                    className="size-4 animate-spin"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <IconDownload
                                                    className="size-4"
                                                    stroke={1.8}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {working ? t("exporting") : t("export")}
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            onClick={handleReset}
                                            disabled={working}
                                            className="h-9 px-3"
                                        >
                                            <IconTrash
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("reset")}
                                        </Button>
                                    </>
                                )}
                            </div>

                            {/*
                             * Predictive rather than retrospective. There is no
                             * result panel to report what happened, so the line
                             * that used to sit under one says what the next
                             * press will do instead.
                             */}
                            {plan !== null && (
                                <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                                    {t(batch ? "batchSummary" : "exportSummary", {
                                        width: format.number(output.width),
                                        height: format.number(output.height),
                                        format: tFormats(outputFormat),
                                    })}{" "}
                                    {copiesPixels(plan) ? t("outputCopied") : t("outputResampled")}
                                </p>
                            )}

                            {/*
                             * The batch's one rule, said where the crop and turn
                             * buttons would have been: hand edits are to one
                             * picture, so with several loaded they are gone.
                             */}
                            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                                {batch
                                    ? t("batchHint")
                                    : cropping
                                      ? t("cropHint")
                                      : t("previewHint")}
                            </p>
                        </div>

                        <div className="flex min-w-0 flex-col gap-4">
                            {/*
                             * Says why, beside the controls it is talking about.
                             * A panel that has quietly gone dead is a bug report;
                             * one that says what will bring it back is a step.
                             */}
                            {cropping && (
                                <p
                                    role="status"
                                    className="bg-card/60 ring-border/70 text-muted-foreground rounded-xl px-3 py-2 text-[0.75rem] leading-[1.4] ring-1 ring-inset"
                                >
                                    {t("settingsLockedHint")}
                                </p>
                            )}

                            {/*
                             * The shape lock and its custom field stay live
                             * while cropping — they sit in this column but they
                             * are crop controls, and locking them would mean
                             * cancelling the crop to choose a ratio and starting
                             * the drag again.
                             */}
                            <OptionSelect<AspectPreset>
                                label={t("ratioLabel")}
                                hint={batch ? t("ratioHintBatch") : t("ratioHint")}
                                value={aspect}
                                values={ASPECT_PRESETS}
                                disabled={working}
                                items={Object.fromEntries(
                                    ASPECT_PRESETS.map((value) => [
                                        value,
                                        value === "free"
                                            ? t("ratioFree")
                                            : value === "original"
                                              ? t("ratioOriginal")
                                              : value === "custom"
                                                ? t("ratioCustom")
                                                : value,
                                    ]),
                                )}
                                onChange={selectAspect}
                            />

                            {aspect === "custom" && (
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <Label
                                        htmlFor={ratioTextId}
                                        className="text-muted-foreground text-xs"
                                    >
                                        <span className="leading-[1.3]">
                                            {t("customRatioLabel")}
                                        </span>
                                    </Label>
                                    <Input
                                        id={ratioTextId}
                                        value={customRatio}
                                        // A short identity field: refusing the
                                        // keystroke past a ratio's length costs
                                        // nothing. See input-limits.md.
                                        maxLength={16}
                                        placeholder={t("customRatioPlaceholder")}
                                        disabled={working}
                                        aria-invalid={customInvalid ? true : undefined}
                                        onChange={(event) => selectCustomRatio(event.target.value)}
                                        className="h-9 font-mono text-[0.8125rem]"
                                    />
                                    <p
                                        className={cn(
                                            "text-[0.6875rem] leading-[1.4]",
                                            customInvalid
                                                ? "text-destructive"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {customInvalid
                                            ? t("customRatioInvalid")
                                            : t("customRatioHint")}
                                    </p>
                                </div>
                            )}

                            <div className="flex min-w-0 flex-col gap-1.5">
                                <span className="text-muted-foreground text-xs leading-[1.3]">
                                    {t("modeLabel")}
                                </span>
                                <div
                                    role="group"
                                    aria-label={t("modeLabel")}
                                    className="bg-muted/50 ring-border/70 flex min-w-0 gap-1 rounded-lg p-1 ring-1 ring-inset"
                                >
                                    {RESIZE_MODES.map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            disabled={settingsLocked}
                                            aria-pressed={options.mode === value}
                                            onClick={() => patch({ mode: value })}
                                            className={cn(
                                                "focus-visible:ring-ring min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-[0.75rem] leading-[1.3] transition-colors focus-visible:ring-2 focus-visible:outline-none",
                                                options.mode === value
                                                    ? "bg-card text-foreground shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground",
                                            )}
                                        >
                                            {t(MODE_LABEL_KEY[value])}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {options.mode === "dimensions" && (
                                <>
                                    <div className="flex min-w-0 items-end gap-2">
                                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            <Label
                                                htmlFor={widthId}
                                                className="text-muted-foreground text-xs"
                                            >
                                                <span className="leading-[1.3]">
                                                    {t("widthLabel")}
                                                </span>
                                            </Label>
                                            <Input
                                                id={widthId}
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                value={options.width ?? ""}
                                                placeholder={t("widthPlaceholder")}
                                                disabled={settingsLocked}
                                                onChange={(event) =>
                                                    setDimension("width", event.target.value)
                                                }
                                                className="h-9 min-w-0 font-mono text-[0.8125rem] tabular-nums"
                                            />
                                        </div>

                                        {/*
                                         * Between the two fields rather than a
                                         * switch below them, because what it
                                         * locks is the pair: an unbroken chain
                                         * beside a number is the one place a
                                         * reader looks to ask why the other
                                         * number moved on its own.
                                         */}
                                        <button
                                            type="button"
                                            aria-pressed={options.lockAspect}
                                            aria-label={
                                                options.lockAspect
                                                    ? t("lockAspectOn")
                                                    : t("lockAspectOff")
                                            }
                                            title={
                                                options.lockAspect
                                                    ? t("lockAspectOn")
                                                    : t("lockAspectOff")
                                            }
                                            disabled={settingsLocked}
                                            onClick={() =>
                                                patch({ lockAspect: !options.lockAspect })
                                            }
                                            className={cn(
                                                "focus-visible:ring-ring mb-0.5 grid size-8 shrink-0 place-items-center rounded-lg ring-1 transition-colors duration-200 ring-inset focus-visible:ring-2 focus-visible:outline-none disabled:opacity-55",
                                                options.lockAspect
                                                    ? "text-primary bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] ring-[color-mix(in_oklch,var(--primary)_35%,transparent)]"
                                                    : "text-muted-foreground ring-border/70 hover:text-foreground",
                                            )}
                                        >
                                            {options.lockAspect ? (
                                                <IconLink
                                                    className="size-4"
                                                    stroke={1.9}
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <IconUnlink
                                                    className="size-4"
                                                    stroke={1.9}
                                                    aria-hidden="true"
                                                />
                                            )}
                                        </button>

                                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            <Label
                                                htmlFor={heightId}
                                                className="text-muted-foreground text-xs"
                                            >
                                                <span className="leading-[1.3]">
                                                    {t("heightLabel")}
                                                </span>
                                            </Label>
                                            <Input
                                                id={heightId}
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                value={options.height ?? ""}
                                                placeholder={t("heightPlaceholder")}
                                                disabled={settingsLocked}
                                                onChange={(event) =>
                                                    setDimension("height", event.target.value)
                                                }
                                                className="h-9 min-w-0 font-mono text-[0.8125rem] tabular-nums"
                                            />
                                        </div>
                                    </div>

                                    <p className="text-muted-foreground -mt-2 text-[0.6875rem] leading-[1.4]">
                                        {!options.lockAspect
                                            ? t("lockAspectHintOff")
                                            : batch
                                              ? t("lockAspectHintBatch")
                                              : t("lockAspectHintOn")}
                                    </p>

                                    <OptionSelect<LengthUnit>
                                        label={t("unitLabel")}
                                        hint={t("dimensionsHint")}
                                        value={options.unit}
                                        values={LENGTH_UNITS}
                                        disabled={settingsLocked}
                                        items={Object.fromEntries(
                                            LENGTH_UNITS.map((value) => [
                                                value,
                                                t(UNIT_LABEL_KEY[value]),
                                            ]),
                                        )}
                                        onChange={selectUnit}
                                    />
                                </>
                            )}

                            {options.mode === "percentage" && (
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <span
                                        id={percentId}
                                        className="text-muted-foreground text-xs leading-[1.3]"
                                    >
                                        {t("percentageLabel")}
                                    </span>
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Slider
                                            aria-labelledby={percentId}
                                            value={options.percentage}
                                            min={MIN_PERCENTAGE}
                                            max={MAX_PERCENTAGE}
                                            disabled={settingsLocked}
                                            onValueChange={(next) =>
                                                patch({
                                                    percentage: clampPercentage(
                                                        Array.isArray(next)
                                                            ? (next[0] ?? options.percentage)
                                                            : next,
                                                    ),
                                                })
                                            }
                                            className="min-w-0 flex-1"
                                        />
                                        <span className="w-11 shrink-0 text-right font-mono text-sm tabular-nums">
                                            {options.percentage}%
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {t("percentageHint", {
                                            value: format.number(options.percentage),
                                            width: format.number(output.width),
                                            height: format.number(output.height),
                                        })}
                                    </p>
                                </div>
                            )}

                            {options.mode === "preset" && (
                                <PresetPicker
                                    presetId={options.presetId}
                                    dpi={options.dpi}
                                    disabled={settingsLocked}
                                    onChange={selectPreset}
                                />
                            )}

                            {(isPhysicalUnit(options.unit) ||
                                options.mode === "preset" ||
                                options.embedDensity) && (
                                <OptionSelect<string>
                                    label={t("dpiLabel")}
                                    hint={
                                        isPhysicalUnit(options.unit) || options.mode === "preset"
                                            ? t("dpiHint", {
                                                  width: format.number(
                                                      toPixels(45, "mm", options.dpi),
                                                  ),
                                                  height: format.number(
                                                      toPixels(55, "mm", options.dpi),
                                                  ),
                                              })
                                            : t("dpiHintScreen")
                                    }
                                    value={String(options.dpi)}
                                    values={
                                        DPI_VALUES.includes(String(options.dpi))
                                            ? DPI_VALUES
                                            : [...DPI_VALUES, String(options.dpi)]
                                    }
                                    disabled={settingsLocked}
                                    items={Object.fromEntries(
                                        [...DPI_VALUES, String(options.dpi)].map((value) => [
                                            value,
                                            `${value} ${t("dpiUnit")}`,
                                        ]),
                                    )}
                                    onChange={(next) => patch({ dpi: clampDpi(Number(next)) })}
                                />
                            )}

                            <OptionSelect<FitMode>
                                label={t("fitLabel")}
                                hint={fitMatters ? t(FIT_HINT_KEY[options.fit]) : t("fitHintExact")}
                                value={options.fit}
                                values={FIT_MODES}
                                disabled={settingsLocked || !fitMatters}
                                items={Object.fromEntries(
                                    FIT_MODES.map((value) => [value, t(FIT_LABEL_KEY[value])]),
                                )}
                                onChange={(next) => patch({ fit: next })}
                            />

                            {/*
                             * Under the fit picker, because it is the same
                             * question one step finer: `fit` decides how the
                             * picture meets the frame, and this decides how far
                             * past that it is pushed. Above 100% the overflow is
                             * cut, which is the whole point — a freely rotated
                             * photograph has transparent corners, and zooming
                             * until they leave the frame is how they go away.
                             */}
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <div className="flex min-w-0 items-center justify-between gap-2">
                                    <span
                                        id={zoomId}
                                        className="text-muted-foreground text-xs leading-[1.3]"
                                    >
                                        {t("zoomLabel")}
                                    </span>
                                    {options.zoom !== DEFAULT_ZOOM && (
                                        <button
                                            type="button"
                                            disabled={settingsLocked}
                                            onClick={() => patch({ zoom: DEFAULT_ZOOM })}
                                            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md text-[0.6875rem] underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-55"
                                        >
                                            {t("zoomReset")}
                                        </button>
                                    )}
                                </div>
                                <div className="flex min-w-0 items-center gap-2">
                                    {/*
                                     * A press either side of the drag, because
                                     * the last five percent of a zoom is the
                                     * part that matters and a 20 rem slider is
                                     * about three pixels per step. Bounded by
                                     * the same clamp the slider is, so neither
                                     * button can walk past an end.
                                     */}
                                    <IconPress
                                        label={t("zoomOut", { step: format.number(ZOOM_STEP) })}
                                        disabled={settingsLocked || options.zoom <= MIN_ZOOM}
                                        onClick={() => nudgeZoom(-ZOOM_STEP)}
                                        className="size-7"
                                    >
                                        <IconMinus
                                            className="size-4"
                                            stroke={2}
                                            aria-hidden="true"
                                        />
                                    </IconPress>

                                    <Slider
                                        aria-labelledby={zoomId}
                                        value={options.zoom}
                                        min={MIN_ZOOM}
                                        max={MAX_ZOOM}
                                        disabled={settingsLocked}
                                        onValueChange={(next) =>
                                            patch({
                                                zoom: clampZoom(
                                                    Array.isArray(next)
                                                        ? (next[0] ?? options.zoom)
                                                        : next,
                                                ),
                                            })
                                        }
                                        className="min-w-0 flex-1"
                                    />

                                    <IconPress
                                        label={t("zoomIn", { step: format.number(ZOOM_STEP) })}
                                        disabled={settingsLocked || options.zoom >= MAX_ZOOM}
                                        onClick={() => nudgeZoom(ZOOM_STEP)}
                                        className="size-7"
                                    >
                                        <IconPlus
                                            className="size-4"
                                            stroke={2}
                                            aria-hidden="true"
                                        />
                                    </IconPress>

                                    <span className="w-11 shrink-0 text-right font-mono text-sm tabular-nums">
                                        {options.zoom}%
                                    </span>
                                </div>
                                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {plan !== null && plan.clips
                                        ? t("zoomHintClips", {
                                              value: format.number(options.zoom),
                                          })
                                        : options.zoom === DEFAULT_ZOOM
                                          ? t("zoomHintExact")
                                          : t("zoomHintPads", {
                                                value: format.number(options.zoom),
                                            })}
                                </p>
                            </div>

                            <div className="flex min-w-0 flex-col gap-1.5">
                                <OptionSelect<BackgroundKind>
                                    label={t("backgroundLabel")}
                                    hint={
                                        !backgroundLive
                                            ? t("backgroundDisabledHint")
                                            : supportsAlpha(outputFormat)
                                              ? t("backgroundHint")
                                              : t("backgroundJpegHint")
                                    }
                                    value={options.background}
                                    values={BACKGROUND_KINDS}
                                    disabled={settingsLocked || !backgroundLive}
                                    items={Object.fromEntries(
                                        BACKGROUND_KINDS.map((value) => [
                                            value,
                                            t(BACKGROUND_LABEL_KEY[value]),
                                        ]),
                                    )}
                                    onChange={(next) => patch({ background: next })}
                                />

                                {options.background === "color" && (
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Label
                                            htmlFor={colorId}
                                            className="text-muted-foreground text-xs"
                                        >
                                            <span className="leading-[1.3]">
                                                {t("backgroundColorLabel")}
                                            </span>
                                        </Label>
                                        <input
                                            id={colorId}
                                            type="color"
                                            value={options.backgroundColor}
                                            disabled={settingsLocked || !backgroundLive}
                                            onChange={(event) =>
                                                patch({ backgroundColor: event.target.value })
                                            }
                                            className="border-border/80 size-8 shrink-0 cursor-pointer rounded-md border bg-transparent"
                                        />
                                        <span className="text-muted-foreground font-mono text-[0.75rem] uppercase">
                                            {options.backgroundColor}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <OptionSelect<OutputFormat>
                                label={t("formatLabel")}
                                hint={tFormats(`${options.format}Hint`)}
                                value={options.format}
                                values={OUTPUT_FORMATS}
                                disabled={settingsLocked}
                                items={Object.fromEntries(
                                    OUTPUT_FORMATS.map((value) => [value, tFormats(value)]),
                                )}
                                onChange={(next) => patch({ format: next })}
                            />

                            <div className="flex min-w-0 flex-col gap-1.5">
                                <span
                                    id={qualityId}
                                    className="text-muted-foreground text-xs leading-[1.3]"
                                >
                                    {t("qualityLabel")}
                                </span>
                                <div className="flex min-w-0 items-center gap-3">
                                    <Slider
                                        aria-labelledby={qualityId}
                                        value={options.quality}
                                        min={MIN_QUALITY}
                                        max={MAX_QUALITY}
                                        disabled={settingsLocked || !qualityLive}
                                        onValueChange={(next) =>
                                            patch({
                                                quality: clampQuality(
                                                    Array.isArray(next)
                                                        ? (next[0] ?? options.quality)
                                                        : next,
                                                ),
                                            })
                                        }
                                        className="min-w-0 flex-1"
                                    />
                                    <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums">
                                        {options.quality}
                                    </span>
                                </div>
                                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {qualityLive
                                        ? t("qualityHint", {
                                              value: format.number(options.quality),
                                          })
                                        : t("qualityHintLossless")}
                                </p>
                            </div>

                            <OptionSwitch
                                label={t("densityLabel")}
                                hint={
                                    densityAvailable
                                        ? t("densityHint", { dpi: format.number(options.dpi) })
                                        : t("densityUnavailable")
                                }
                                checked={options.embedDensity && densityAvailable}
                                disabled={settingsLocked || !densityAvailable}
                                onCheckedChange={(next) => patch({ embedDensity: next })}
                            />
                        </div>
                    </div>
                )}

                <ToolNotes
                    notes={[
                        {
                            key: "privacy",
                            icon: IconShieldCheck,
                            tone: "success",
                            title: t("privacyTitle"),
                            body: t("privacyNote"),
                        },
                        {
                            key: "metadata",
                            icon: IconInfoCircle,
                            title: t("metadataTitle"),
                            body: t("metadataNote"),
                        },
                    ]}
                />
            </CardContent>
        </Card>
    );
}

function replaceItem(
    items: readonly BatchItem[],
    id: string,
    patch: Partial<BatchItem>,
): readonly BatchItem[] {
    return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}
