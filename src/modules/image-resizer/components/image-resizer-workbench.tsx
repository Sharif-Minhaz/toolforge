"use client";

import {
    IconArrowBackUp,
    IconCheck,
    IconCrop,
    IconDownload,
    IconFlipHorizontal,
    IconFlipVertical,
    IconFocusCentered,
    IconLink,
    IconLoader2,
    IconMaximize,
    IconMinus,
    IconPhotoPlus,
    IconPlus,
    IconRefresh,
    IconRotate,
    IconRotateClockwise,
    IconTrash,
    IconUnlink,
    IconX,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { decodeToPixels } from "@/modules/tools/domain/image-codec";
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
import { applyRatio, centeredCrop, fullCrop, isFullCrop } from "../domain/crop";
import { densityApplies } from "../domain/density";
import { buildOutputFilename } from "../domain/filenames";
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
    type ResizeFailureReason,
    type ResizeMode,
    type ResizeOptions,
    type RgbaImage,
} from "../types";
import { cropPixels } from "../domain/compose";
import { CropCanvas } from "./crop-canvas";
import { OutputPreview } from "./output-preview";
import { PresetPicker } from "./preset-picker";

/** One picture, decoded once and kept, because every export re-reads it. */
type Loaded = {
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
    const [dragging, setDragging] = useState(false);
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

    const sourceType = loaded?.file.type ?? "";
    const outputFormat = resolveFormat(sourceType, options.format);
    // Derived during render from pure functions, so the numbers under the
    // controls are never a frame behind the controls themselves.
    const plan = loaded === null ? null : planRender(crop, options);
    const output = plan?.canvas ?? { width: 0, height: 0 };
    const ratio = ratioForPreset(
        aspect,
        loaded?.size ?? { width: 1, height: 1 },
        parseAspectText(customRatio),
    );
    const customInvalid = aspect === "custom" && customRatio.trim() !== "" && ratio === null;
    const densityAvailable = densityApplies(outputFormat);
    const backgroundLive = backgroundApplies(options.fit, outputFormat, loaded?.hasAlpha ?? false);
    const fitMatters =
        plan !== null &&
        (plan.clips ||
            plan.draw.width !== plan.canvas.width ||
            plan.draw.height !== plan.canvas.height);

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
        if (working) {
            return { tone: "pending", message: t("statusWorking") };
        }

        if (reason !== null) {
            return { tone: "error", message: describeFailure(reason) };
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

    async function handleFiles(files: readonly File[]) {
        const file = files[0];

        if (file === undefined || working) {
            return;
        }

        const checked = checkImageFile(file, IMAGE_FILE_LIMITS);

        if (!checked.ok) {
            setReason(checked.reason);
            toast.error(describeFailure(checked.reason));

            return;
        }

        setWorking(true);
        setReason(null);

        try {
            const pixels = await decodeToPixels(file);

            if (pixels === null) {
                setReason("undecodable");
                toast.error(describeFailure("undecodable"));

                return;
            }

            if (pixels.width * pixels.height > MAX_PIXELS) {
                setReason("too_many_pixels");
                toast.error(describeFailure("too_many_pixels"));

                return;
            }

            const previewUrl = URL.createObjectURL(file);

            objectUrls.current.add(previewUrl);

            const size = { width: pixels.width, height: pixels.height };
            const hasAlpha = !isOpaque(pixels);

            if (loaded !== null) {
                releaseUrl(loaded.previewUrl);
            }

            clearHistory();
            setLoaded({ file, previewUrl, pixels, size, hasAlpha });
            // A fresh picture opens as a picture, not as a crop in progress.
            setCropping(false);
            placeCrop(fullCrop(size));
        } catch (caught) {
            logEvent("error", "image_resizer.decode_threw", { error: describeError(caught) });
            setReason("undecodable");
        } finally {
            setWorking(false);
        }
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        void handleFiles([...event.dataTransfer.files]);
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

        if (!options.lockAspect || value === null || loaded === null) {
            patch({ [side]: value });

            return;
        }

        const shape = cropRatio(crop);
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

    function handleReset() {
        if (loaded !== null) {
            releaseUrl(loaded.previewUrl);
        }

        clearHistory();
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
                    <input
                        id={inputId}
                        type="file"
                        accept={IMAGE_ACCEPT_ATTRIBUTE}
                        disabled={working}
                        aria-describedby={hintId}
                        onChange={(event) => {
                            void handleFiles([...(event.target.files ?? [])]);
                            // Cleared so picking the same file twice still fires.
                            event.target.value = "";
                        }}
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
                            {t("dropHint", { limit: byteLabel(MAX_IMAGE_BYTES) })}
                        </span>
                    </label>

                    <ImageSourceControls
                        onFiles={(files) => void handleFiles(files)}
                        disabled={working}
                        urlImportEnabled={urlImportEnabled}
                    />

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                {loaded !== null && (
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
                            {cropping && plan !== null ? (
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
                                plan !== null && (
                                    <OutputPreview
                                        previewUrl={loaded.previewUrl}
                                        alt={t("resultAlt")}
                                        source={loaded.size}
                                        plan={plan}
                                    />
                                )
                            )}

                            {cropping && (
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
                             * pointer mid-drag.
                             */}
                            {!cropping && (
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
                                {cropping ? (
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
                            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                                {t("exportSummary", {
                                    width: format.number(output.width),
                                    height: format.number(output.height),
                                    format: tFormats(outputFormat),
                                })}{" "}
                                {plan !== null && copiesPixels(plan)
                                    ? t("outputCopied")
                                    : t("outputResampled")}
                            </p>

                            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                                {cropping ? t("cropHint") : t("previewHint")}
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
                                hint={t("ratioHint")}
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
                                        {options.lockAspect
                                            ? t("lockAspectHintOn")
                                            : t("lockAspectHintOff")}
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
                                        disabled={settingsLocked || !qualityApplies(outputFormat)}
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
                                    {qualityApplies(outputFormat)
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

                <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                    {t("metadataNote")}
                </p>

                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("privacyNote")}
                </p>
            </CardContent>
        </Card>
    );
}
