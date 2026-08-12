import type { MatteColor, PixelSize, RasterFormat } from "@/modules/tools/types";

/**
 * The three questions a reader arrives with, and the reason this tool has three
 * modes rather than one box: "make it 1200 wide", "make it half the size", and
 * "make it whatever a Bangladeshi passport photo is". Each is a different way
 * of naming an output box, and none of them is expressible in the others
 * without the reader doing arithmetic the tool exists to do.
 */
export const RESIZE_MODES = ["dimensions", "percentage", "preset"] as const;

export type ResizeMode = (typeof RESIZE_MODES)[number];

/**
 * What a typed dimension is measured in.
 *
 * The three physical units only mean anything alongside a resolution, which is
 * why `dpi` sits next to them in the options rather than being a constant: 45 mm
 * is 532 pixels at 300 DPI and 1063 at 600, and a passport office that asks for
 * millimetres is asking about paper.
 */
export const LENGTH_UNITS = ["px", "in", "cm", "mm"] as const;

export type LengthUnit = (typeof LENGTH_UNITS)[number];

export const PHYSICAL_UNITS: readonly LengthUnit[] = ["in", "cm", "mm"];

/**
 * What happens when the box asked for is a different shape from the picture in
 * it. Every one of the three loses something, and the tool says which:
 *
 * - `contain` keeps the whole picture and pads the difference with the
 *   background — the passport-photo answer, because a face must not be cut.
 * - `cover` fills the box and cuts the overflow off the long edge.
 * - `stretch` keeps every pixel and distorts them. Almost never what anyone
 *   wants, and offered because the alternative is people doing it by hand with
 *   the aspect lock off and not realising.
 */
export const FIT_MODES = ["contain", "cover", "stretch"] as const;

export type FitMode = (typeof FIT_MODES)[number];

/** What fills the padding `contain` leaves, and what alpha flattens onto. */
export const BACKGROUND_KINDS = ["transparent", "color"] as const;

export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];

/**
 * `original` keeps whatever the source was, which is the honest default for a
 * tool whose promise is "remove the exceeded part and change nothing else".
 */
export const OUTPUT_FORMATS = ["original", "png", "jpeg", "webp", "avif"] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * A rectangle in the **source image's** pixel space, always integral.
 *
 * Source space rather than screen space on purpose: the preview is whatever
 * size the viewport allows and changes when the window does, and a crop stored
 * in screen pixels silently means something different after a resize.
 */
export type CropRect = {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

/** The eight drag points on a crop box, named by compass direction. */
export const CROP_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

export type CropHandle = (typeof CROP_HANDLES)[number];

/**
 * A locked shape, as the two numbers a person says out loud rather than as the
 * quotient.
 *
 * Kept unreduced because `16:9` and `1.777…` are the same constraint but not
 * the same label, and the label is what goes back into the input the reader
 * typed it in.
 */
export type AspectRatio = {
    readonly width: number;
    readonly height: number;
};

/** Which named shape the ratio picker is on. `free` and `custom` have no fixed pair. */
export const ASPECT_PRESETS = [
    "free",
    "original",
    "1:1",
    "4:3",
    "3:2",
    "16:9",
    "3:4",
    "2:3",
    "9:16",
    "custom",
] as const;

export type AspectPreset = (typeof ASPECT_PRESETS)[number];

/** Which list a size preset belongs to, and therefore which picker it appears in. */
export const PRESET_GROUPS = ["social", "photo", "print"] as const;

export type PresetGroup = (typeof PRESET_GROUPS)[number];

/**
 * A preset's size, in whichever terms the thing that asked for it is defined.
 *
 * A Facebook cover is 820 × 312 **pixels**; a Bangladeshi passport photo is
 * 45 × 55 **millimetres** and becomes a different number of pixels at every
 * resolution. Storing the second as pixels would bake in one DPI and quietly
 * hand somebody printing at 600 a photograph half the size their form allows.
 */
export type PresetSize =
    | { readonly kind: "pixels"; readonly width: number; readonly height: number }
    | {
          readonly kind: "physical";
          readonly width: number;
          readonly height: number;
          readonly unit: "mm" | "in";
          /** What the issuing authority prints at, which is what makes it that size. */
          readonly dpi: number;
      };

/**
 * One entry in the preset picker.
 *
 * `platform` and `label` are **data, not copy** — "Facebook", "Cover",
 * "Bangladesh Passport" are proper names, and translating them would make the
 * tool harder to use in Bangla rather than easier. The group headings around
 * them are copy, and are localised.
 */
export type SizePreset = {
    readonly id: string;
    readonly group: PresetGroup;
    readonly platform: string;
    readonly label: string;
    readonly size: PresetSize;
    /** Set where the shape matters more than the pixels — a document photo. */
    readonly fit?: FitMode;
};

/** Everything the panel holds, in one object with one updater. */
export type ResizeOptions = {
    readonly mode: ResizeMode;
    /** Blank is a real state: one side given and the other derived. */
    readonly width: number | null;
    readonly height: number | null;
    readonly unit: LengthUnit;
    readonly dpi: number;
    readonly percentage: number;
    readonly presetId: string;
    readonly lockAspect: boolean;
    readonly fit: FitMode;
    readonly background: BackgroundKind;
    /** `#rrggbb`. Only read when `background` is `color`. */
    readonly backgroundColor: string;
    readonly format: OutputFormat;
    readonly quality: number;
    /** Written into the file, so a print comes out the size it was asked for. */
    readonly embedDensity: boolean;
};

/**
 * Everything the renderer needs, worked out before a single pixel is touched.
 *
 * Derived by `planRender` from the source size, the crop and the options, and
 * pure — which is what makes the whole geometry of this tool unit-testable
 * without a canvas.
 */
export type RenderPlan = {
    /** The part of the source that survives. */
    readonly crop: CropRect;
    /** The finished file's size. */
    readonly canvas: PixelSize;
    /** Where the scaled crop lands on that canvas; may fall outside it under `cover`. */
    readonly draw: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    /** `null` keeps the alpha channel; a colour flattens onto it. */
    readonly matte: MatteColor | null;
    /**
     * False when the crop lands at exactly its own size — the whole point of
     * the tool's headline promise, and what the UI reads to say "no resampling".
     */
    readonly resamples: boolean;
    /** True when part of the crop falls outside the canvas under `cover`. */
    readonly clips: boolean;
};

/** Raw pixels, as a plain shape so the geometry is testable without `ImageData`. */
export type RgbaImage = {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
};

export type ResizeFailureReason =
    | "empty_file"
    | "unsupported_type"
    | "too_large"
    | "too_many_pixels"
    | "undecodable"
    | "empty_crop"
    | "output_too_large"
    | "encode_failed";

export type ResizedImage = {
    readonly blob: Blob;
    readonly bytes: number;
    readonly format: RasterFormat;
    readonly size: PixelSize;
    /** Carried through so the summary can say a crop was copied, not resampled. */
    readonly resampled: boolean;
};

export type ResizeResult =
    | { readonly ok: true; readonly image: ResizedImage }
    | { readonly ok: false; readonly reason: ResizeFailureReason };
