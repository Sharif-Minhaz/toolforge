import type { ImageFileLimits } from "@/modules/tools/domain/image-file";

import type { CutoutQuality } from "../types";

/**
 * How many pictures the workbench holds at once.
 *
 * Each slot keeps its own decoded source, its own cut-out and its own composite,
 * and a decoded bitmap costs four bytes a pixel however small the file was — a
 * 12-megapixel phone photograph is 48 MB in memory before anything is drawn. Five
 * is the point where that is still comfortable on a mid-range phone; the sixth is
 * where a tab starts being killed mid-cut-out, which is worse than being told the
 * strip is full.
 */
export const MAX_SHEETS = 5;

/**
 * Ceiling on one source picture.
 *
 * Nothing is uploaded, so this is not a transport limit — it is the point past
 * which decoding, segmenting and compositing in one tab stops being something a
 * phone finishes. Higher than the tools that front a model, because there is no
 * worker budget on the other side of it.
 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * What the segmentation model's decoder will read. GIF and BMP are left out
 * deliberately: an animated GIF cannot survive being cut out as a single still,
 * and accepting one would promise something this cannot deliver.
 */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** `accept` for the file input — a hint to the picker, never a substitute for the check. */
export const IMAGE_ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_TYPES.join(",");

/**
 * The pair the shared file check reads, exported as one value so the intake and
 * the strip can never drift into gating pictures differently.
 */
export const IMAGE_FILE_LIMITS: ImageFileLimits<AllowedImageType> = {
    allowedTypes: ALLOWED_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
};

/**
 * The version of the published weight bundle these sizes were read from.
 *
 * The weights live on IMG.LY's CDN rather than in this deployment's `public/`,
 * because the smallest of the three models is 42 MB and the largest is 168 MB —
 * not something to put in a git repository or to serve from a function's
 * bandwidth. This is not passed to the library either, since it derives its own
 * asset path from its package version; it is recorded so the next person can
 * tell at a glance whether the numbers below still describe what a reader
 * downloads. Bumping `@imgly/background-removal` means re-reading the manifest:
 *
 *     curl -s https://staticimgly.com/@imgly/background-removal-data/<version>/dist/resources.json
 */
export const MODEL_ASSET_VERSION = "1.7.0";

/**
 * IMG.LY's own name for each weight set, and what it costs to fetch.
 *
 * Exact byte counts read from that manifest rather than estimated, because they
 * are shown to the reader **before** they commit to the download — a number that
 * is merely plausible is worse here than no number at all. `tests/constants.test.ts`
 * checks the internal rules (each tier heavier than the last, every size
 * positive); it deliberately does not fetch the manifest, because a unit test
 * that needs a CDN fails on an aeroplane rather than when something is wrong.
 */
export const CUTOUT_MODELS: Record<
    CutoutQuality,
    { readonly model: "isnet_quint8" | "isnet_fp16" | "isnet"; readonly bytes: number }
> = {
    fast: { model: "isnet_quint8", bytes: 44_348_940 },
    balanced: { model: "isnet_fp16", bytes: 88_152_708 },
    best: { model: "isnet", bytes: 176_149_806 },
};

/**
 * The WebAssembly build of the runtime, which is fetched alongside whichever
 * model is chosen. Two of them, because reaching for the GPU pulls the JSEP build
 * instead of the plain one — and the reader is told the total, not the half of it
 * that happens to be the model.
 */
export const RUNTIME_WASM_BYTES = { cpu: 11_819_815 + 25_539, gpu: 23_013_109 + 49_241 } as const;

/**
 * Which weights to reach for first.
 *
 * `balanced` rather than `fast`, because the question a background remover is
 * opened to answer is whether the edge of the hair looks right, and the quantised
 * model is visibly worse at exactly that. The reader who cares more about the
 * first download than about the fringe can say so; the reverse — shipping the
 * cheap answer by default and hoping nobody looks closely — is the trade this
 * site does not make.
 */
export const DEFAULT_QUALITY: CutoutQuality = "balanced";

/**
 * How strong the blurred-background effect can get, as a share of the picture's
 * **shorter side**.
 *
 * A share rather than a pixel count, because a blur that reads as "far out of
 * focus" on a 600 px picture is imperceptible on a 6000 px one. Tying it to the
 * shorter side means the same number means the same thing whatever was dropped
 * in, which is the whole reason the control is 1–100 rather than a pixel value.
 */
export const MAX_BLUR_SHARE = 0.06;

export const MIN_BLUR_STRENGTH = 1;
export const MAX_BLUR_STRENGTH = 100;
export const DEFAULT_BLUR_STRENGTH = 45;

/**
 * How far past the frame a blurred background is drawn, as a multiple of the
 * blur radius.
 *
 * A blur samples pixels that are not there at the edge of a canvas and averages
 * them toward transparent, which draws a pale border around the whole picture —
 * the single most common way a hand-rolled portrait-mode effect looks broken.
 * Overscanning by twice the radius means every sample inside the frame lands on
 * real pixels. Two rather than three because a Gaussian's tail past 2σ
 * contributes under 5% and the extra draw is not free on a 12-megapixel source.
 */
export const BLUR_OVERSCAN_FACTOR = 2;

/** What the Colour tab starts on when the reader has not chosen a hue yet. */
export const DEFAULT_BACKGROUND_COLOR = "#ffffff";

/**
 * Ceiling on the longer side of the picture the model is handed.
 *
 * **1024, because that is the model's own input size.** IMG.LY resizes whatever
 * it is given to 1024 × 1024 before inference and scales the mask back
 * afterwards — and both of those resizes are a bilinear loop *in JavaScript, on
 * the main thread*, four `ndarray.get()` calls per pixel per channel. Handing it
 * a 2048-wide copy therefore bought exactly nothing at the boundary, because the
 * mask is computed at 1024 either way, and cost about six times the main-thread
 * work to scale a mask back up to a size this page immediately scales again.
 *
 * The downsample to 1024 now happens once, on the GPU, in `toSegmentationInput`.
 * That is both faster and a better filter than the loop it replaces.
 */
export const MAX_SEGMENTATION_SIDE = 1024;

/**
 * Ceiling on the longer side of the finished picture.
 *
 * Four bytes a pixel, and a composite needs **two** canvases live at once — the
 * subject with its alpha applied, and the frame it is drawn onto. At a
 * twelve-megapixel source that is 48 MB each, on top of the decoded original,
 * on top of a WebAssembly heap holding a model, times up to five open slots.
 * That is not a slow page; it is the tab being killed, and it took a reader's
 * whole machine down with it once.
 *
 * 2560 is deliberately generous — larger than any screen this is likely to be
 * shown on, and larger than every marketplace and print-on-demand upload limit
 * worth naming. It also costs less than it looks: the alpha channel is computed
 * at 1024 whatever happens, so the *edge* of the cut-out has no more detail at
 * 6000 px than it does here. What a bigger number would buy is a bigger file,
 * not a better cut-out.
 *
 * A picture that is already smaller is never scaled up, and the result panel
 * says so whenever a picture was scaled down.
 */
export const MAX_COMPOSITE_SIDE = 2560;

/**
 * Ceiling on the longer side of the canvas a blurred background is drawn on
 * before being scaled up to the frame.
 *
 * `ctx.filter = "blur(150px)"` across several megapixels is one of the most
 * expensive things a 2D canvas can be asked to do, and it is pure main-thread
 * time — seconds of it, with the tab unresponsive throughout.
 *
 * It is also completely unnecessary. A blur *is* the destruction of fine detail:
 * blurring a quarter-size copy and scaling it back up is visually
 * indistinguishable from blurring at full size, because there is nothing left in
 * the result that a quarter-size copy could not carry. The radius is scaled with
 * the canvas so the strength stays the same.
 */
export const MAX_BLUR_RENDER_SIDE = 900;

/** How many stock photographs one search page holds. Eight rows of three. */
export const PHOTO_PAGE_SIZE = 24;

/**
 * How many are asked for upstream, before the people filter thins them.
 *
 * Twice the page size, and it costs nothing extra: Pexels meters **requests**,
 * not photographs, so asking for forty-eight and keeping twenty-four spends
 * exactly the same allowance as asking for twenty-four would. Without the
 * headroom a page whose alt text happens to mention people comes back
 * half-empty, and the reader reads that as the search being bad rather than as
 * the filter working.
 */
export const PHOTO_FETCH_SIZE = 48;

/**
 * A short identity field, so the keystroke past the ceiling is refused rather
 * than metered — `CLAUDE.md` rule 9 and its decision tree. Nobody searches stock
 * photography with a paragraph.
 */
export const MAX_PHOTO_QUERY_LENGTH = 80;

/** How many pages deep the picker will go. Past this, a better query beats scrolling. */
export const MAX_PHOTO_PAGE = 10;

/** Both stock-photo counters run in the same minute-long window. */
export const PHOTO_SEARCH_WINDOW_MS = 60_000;

/**
 * Searches one calling address may make in that window.
 *
 * Generous, because typing into a search box is the normal way to use this and
 * the request is debounced already. It is not here to make the picker feel
 * expensive; it is here so a script cannot spend the whole deployment's Pexels
 * allowance in a minute.
 */
export const PHOTO_SEARCH_LIMIT_PER_ADDRESS = 40;

/**
 * …and across the whole deployment.
 *
 * Pexels meters the **API key**, not the caller, so every visitor's search is
 * charged to one 200-an-hour allowance shared by everyone. This is the counter
 * that keeps one busy afternoon from taking the picker away from everybody else,
 * and it is why the copy never describes the limit as being per visitor — the
 * same trap the Watermark Remover's case study records about its worker.
 */
export const PHOTO_SEARCH_LIMIT_PER_SERVER = 180;

/** Pexels' API host. Fixed, not reader-supplied — no address guard applies. */
export const PEXELS_API_ORIGIN = "https://api.pexels.com";

/** Where a credit link points when a photograph is used. */
export const PEXELS_HOME_URL = "https://www.pexels.com";

/**
 * How long the server waits on Pexels before giving up.
 *
 * Short, because the reader is typing: a search that takes eight seconds to fail
 * has already been replaced by the next keystroke, and holding the connection
 * open only occupies a slot the next search needs.
 */
export const PHOTO_SEARCH_TIMEOUT_MS = 8_000;

/**
 * How much of an upstream failure's body is kept for the log. Enough to carry
 * Pexels' own error string, short of a whole HTML page.
 */
export const MAX_UPSTREAM_ERROR_LENGTH = 300;
