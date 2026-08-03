import { loadImageElement } from "./image-element";
import type { PixelSize, RasterFormat } from "../types";

/**
 * The WebAssembly image codecs, and the browser glue they cannot do without.
 *
 * `canvas.toBlob` writes a JPEG, but it is the browser's default writer with
 * one knob — no trellis quantisation, no progressive scans, no sharp YUV — and
 * `drawImage` at a smaller size is whatever the GPU driver does, which on a
 * large reduction is a box filter. Every tool here that treats the output as
 * the product reaches for the real codec instead.
 *
 * Kept in `tools/domain/` because a second tool needed it: the Image Compressor
 * and the Image Converter drive the same four encoders and would otherwise hold
 * two copies of the trap notes below.
 */

export const RASTER_FORMAT_EXTENSIONS: Record<RasterFormat, string> = {
    jpeg: "jpg",
    png: "png",
    webp: "webp",
    avif: "avif",
};

export const RASTER_FORMAT_MIME_TYPES: Record<RasterFormat, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
};

/**
 * MozJPEG, tuned past its defaults.
 *
 * Trellis quantisation searches for the coefficient set with the best
 * rate-distortion trade at the requested quality instead of taking the first
 * one the quantiser produces — it is the single biggest reason to run MozJPEG
 * rather than the browser's `canvas.toBlob`, and it is off by default because
 * it costs encode time. Three loops is where the returns flatten. `quant_table:
 * 3` is Squoosh's ImageMagick table, which holds detail better than the JPEG
 * annex tables on photographs.
 */
export const JPEG_ENCODE_OPTIONS = {
    progressive: true,
    optimize_coding: true,
    trellis_multipass: true,
    trellis_opt_zero: true,
    trellis_opt_table: true,
    trellis_loops: 3,
    quant_table: 3,
    auto_subsample: true,
    smoothing: 0,
} as const;

/**
 * libwebp at its slowest analysis setting.
 *
 * `method: 6` and `pass: 6` spend more time choosing filters and partitions;
 * `use_sharp_yuv` fixes the coloured fringing plain 4:2:0 leaves on saturated
 * edges — the failure most often mistaken for "WebP looks worse than JPEG".
 */
export const WEBP_ENCODE_OPTIONS = {
    method: 6,
    pass: 6,
    use_sharp_yuv: 1,
    alpha_quality: 100,
    sns_strength: 50,
    filter_strength: 60,
} as const;

/**
 * libaom, one step slower than its default. `speed: 5` is the practical floor
 * in WebAssembly — below it a large photograph takes long enough that the tab
 * looks broken. `chromaDeltaQ` spends bits on chroma where the eye is most
 * sensitive to it, and `enableSharpYUV` is the AVIF twin of the WebP setting
 * above.
 */
export const AVIF_ENCODE_OPTIONS = {
    speed: 5,
    subsample: 1,
    chromaDeltaQ: true,
    enableSharpYUV: true,
    sharpness: 0,
    tune: 0,
} as const;

/**
 * OxiPNG effort. PNG is lossless here, so this buys size and nothing else;
 * level 3 finds most of what level 6 does in a fraction of the time.
 */
export const PNG_OPTIMISE_OPTIONS = {
    level: 3,
    interlace: false,
    optimiseAlpha: true,
} as const;

/** Lanczos3, in linear light with premultiplied alpha — Squoosh's own default. */
export const RESIZE_OPTIONS = {
    method: "lanczos3",
    fitMethod: "stretch",
    premultiply: true,
    linearRGB: true,
} as const;

/**
 * Injectable for the same reason `clipboard.ts` and `file-saver.ts` are: it
 * keeps the arithmetic around it pure and testable.
 */
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export const browserCanvasFactory: CanvasFactory = (width, height) => {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    return canvas;
};

/**
 * Decodes a picked file to raw pixels.
 *
 * `createImageBitmap` with `imageOrientation: "from-image"` is what applies the
 * EXIF rotation a phone writes instead of rotating the pixels — without it, a
 * portrait photograph re-encodes sideways, because the tag is dropped along
 * with the rest of the metadata. The `<img>` fallback covers the browsers that
 * lack the option; they apply the orientation themselves when decoding into an
 * element, so both paths agree.
 */
export async function decodeToPixels(
    blob: Blob,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<ImageData | null> {
    const source = await decodeToDrawable(blob);

    if (source === null) {
        return null;
    }

    try {
        const width = "naturalWidth" in source ? source.naturalWidth : source.width;
        const height = "naturalHeight" in source ? source.naturalHeight : source.height;

        if (width <= 0 || height <= 0) {
            return null;
        }

        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");

        if (context === null) {
            return null;
        }

        context.drawImage(source, 0, 0);

        return context.getImageData(0, 0, width, height);
    } finally {
        if ("close" in source) {
            source.close();
        }
    }
}

async function decodeToDrawable(blob: Blob): Promise<ImageBitmap | HTMLImageElement | null> {
    if (typeof createImageBitmap === "function") {
        try {
            return await createImageBitmap(blob, { imageOrientation: "from-image" });
        } catch {
            // Falls through to the element path rather than failing the file:
            // some browsers reject the option instead of ignoring it.
        }
    }

    const url = URL.createObjectURL(blob);

    try {
        return await loadImageElement(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Lanczos3 in linear light — the reason not to hand a downscale to `drawImage`. */
export async function resizePixels(pixels: ImageData, size: PixelSize): Promise<ImageData> {
    const { default: resize } = await import("@jsquash/resize");

    return resize(pixels, { ...RESIZE_OPTIONS, width: size.width, height: size.height });
}

/**
 * AVIF and PNG reach past their package entry point. Both `@jsquash/avif/encode`
 * and `@jsquash/oxipng/optimise` pick between a single-threaded build and a
 * multithreaded one at runtime, and to do that they import **both** — so the
 * pthread build of libaom and the wasm-bindgen-rayon build of OxiPNG enter the
 * module graph even though neither can ever run here.
 *
 * That is not merely wasted bytes. Each of those two files is the only place in
 * the whole dependency that constructs a `new Worker`, and a worker constructor
 * makes the bundler open a nested compilation. Building a route through the
 * package entry points deadlocks `next build`: every process parks in `ep_poll`
 * with no CPU and no I/O, indefinitely.
 *
 * Neither multithreaded build would have been chosen anyway. `avif_enc_mt` is
 * skipped outside a worker context, and OxiPNG's parallel build is skipped
 * unless `self instanceof WorkerGlobalScope` — and this runs on the main
 * thread. Importing the single-threaded codec directly is therefore the same
 * encoder with the same output, minus a compilation that hangs.
 *
 * The instances are memoised because instantiating a WebAssembly module per
 * file would re-download and re-compile several megabytes for every image in
 * the batch.
 */
let avifEncoder: Promise<AvifEncoderModule> | undefined;
let oxipngCodec: Promise<OxipngCodec> | undefined;

type AvifEncoderModule = Awaited<
    ReturnType<Awaited<typeof import("@jsquash/avif/codec/enc/avif_enc.js")>["default"]>
>;

type OxipngCodec = typeof import("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js");

function loadAvifEncoder(): Promise<AvifEncoderModule> {
    avifEncoder ??= import("@jsquash/avif/codec/enc/avif_enc.js").then(
        ({ default: moduleFactory }) => moduleFactory({ noInitialRun: true }),
    );

    return avifEncoder;
}

function loadOxipngCodec(): Promise<OxipngCodec> {
    oxipngCodec ??= import("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js").then(async (codec) => {
        await codec.default();

        return codec;
    });

    return oxipngCodec;
}

/**
 * Runs one encoder over one set of pixels.
 *
 * Each codec is imported on demand, so a reader who only ever writes WebP never
 * downloads libaom. PNG goes through OxiPNG's raw entry point, which builds the
 * file and optimises it in one pass — there is no separate PNG encoder here
 * because there is no reason to write a file only to rewrite it.
 */
export async function encodePixels(
    pixels: ImageData,
    format: RasterFormat,
    quality: number,
): Promise<ArrayBuffer> {
    switch (format) {
        case "jpeg": {
            const { default: encode } = await import("@jsquash/jpeg/encode");

            return encode(pixels, { ...JPEG_ENCODE_OPTIONS, quality });
        }
        case "webp": {
            const { default: encode } = await import("@jsquash/webp/encode");

            return encode(pixels, { ...WEBP_ENCODE_OPTIONS, quality });
        }
        case "avif": {
            const [encoder, { defaultOptions }] = await Promise.all([
                loadAvifEncoder(),
                import("@jsquash/avif/meta.js"),
            ]);

            const encoded = encoder.encode(
                // libaom reads the buffer directly rather than the clamped view.
                new Uint8Array(pixels.data.buffer),
                pixels.width,
                pixels.height,
                { ...defaultOptions, ...AVIF_ENCODE_OPTIONS, quality },
            );

            if (encoded === null) {
                throw new Error("AVIF encoding failed");
            }

            return toArrayBuffer(encoded);
        }
        case "png": {
            const codec = await loadOxipngCodec();

            return toArrayBuffer(
                codec.optimise_raw(
                    pixels.data,
                    pixels.width,
                    pixels.height,
                    PNG_OPTIMISE_OPTIONS.level,
                    PNG_OPTIMISE_OPTIONS.interlace,
                    PNG_OPTIMISE_OPTIONS.optimiseAlpha,
                ),
            );
        }
    }
}

/**
 * Copies a codec's view of wasm memory out into a buffer of its own.
 *
 * `.buffer` on what these two return is the module's entire linear memory, and
 * the next encode in the batch writes over it. The package entry points handed
 * back that live view; taking a slice is what makes a queued result still be
 * the image it was when it finished.
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
    return view.slice().buffer;
}
