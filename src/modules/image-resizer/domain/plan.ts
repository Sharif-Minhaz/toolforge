import { MAX_DIMENSION, MAX_OUTPUT_PIXELS, MIN_DIMENSION } from "./constants";
import { clampZoom } from "./options";
import { findPreset, presetPixels } from "./presets";
import { toPixels } from "./units";
import type { CropRect, RenderPlan, ResizeOptions } from "../types";
import type { MatteColor, PixelSize } from "@/modules/tools/types";

/**
 * The whole geometry of the tool, worked out before a pixel is touched.
 *
 * Every question the renderer could ask — how big is the file, where does the
 * picture sit on it, is anything being scaled at all — is answered here, in
 * arithmetic, from three inputs and nothing else. That is what makes the
 * fiddliest behaviour in this module testable: `bun test` cannot decode a JPEG,
 * but it can assert that a 45 × 55 mm passport photo at 600 DPI is 1063 × 1299
 * and that a landscape photograph inside it is letterboxed rather than cropped.
 */

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `#fff` and `#ffffff` and `ffffff`, all three. Anything else is white — an
 * unparseable colour is a typo in a text field, and a document photo on a
 * transparent-turned-black background is the worst possible way to find out.
 */
export function parseHexColor(input: string): MatteColor {
    const matched = HEX_COLOR.exec(input.trim());

    if (matched === null) {
        return { r: 255, g: 255, b: 255 };
    }

    const digits = matched[1];
    const full =
        digits.length === 3
            ? digits
                  .split("")
                  .map((character) => character + character)
                  .join("")
            : digits;

    return {
        r: Number.parseInt(full.slice(0, 2), 16),
        g: Number.parseInt(full.slice(2, 4), 16),
        b: Number.parseInt(full.slice(4, 6), 16),
    };
}

function clampDimension(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_DIMENSION;
    }

    return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(value)));
}

/**
 * The box the reader has asked for, in pixels.
 *
 * Three modes, one answer. The interesting case is `dimensions` with the aspect
 * lock on and one side left blank, which is the shape most people actually
 * want: "1200 wide, and you work out the rest". The rest is worked out from the
 * **crop**, not from the original picture — the crop is what is being resized,
 * and using the source's shape here would silently letterbox every cropped
 * photograph.
 */
export function targetSize(crop: CropRect, options: ResizeOptions): PixelSize {
    switch (options.mode) {
        case "percentage": {
            const scale = options.percentage / 100;

            return {
                width: clampDimension(crop.width * scale),
                height: clampDimension(crop.height * scale),
            };
        }
        case "preset": {
            const preset = findPreset(options.presetId);

            if (preset === null) {
                return { width: crop.width, height: crop.height };
            }

            const size = presetPixels(preset.size, options.dpi);

            return { width: clampDimension(size.width), height: clampDimension(size.height) };
        }
        case "dimensions": {
            const width =
                options.width === null ? null : toPixels(options.width, options.unit, options.dpi);
            const height =
                options.height === null
                    ? null
                    : toPixels(options.height, options.unit, options.dpi);

            if (width === null && height === null) {
                return { width: crop.width, height: crop.height };
            }

            const ratio = crop.height > 0 ? crop.width / crop.height : 1;

            if (width !== null && height !== null) {
                return { width: clampDimension(width), height: clampDimension(height) };
            }

            if (width !== null) {
                return {
                    width: clampDimension(width),
                    height: options.lockAspect
                        ? clampDimension(width / ratio)
                        : clampDimension(crop.height),
                };
            }

            return {
                width: options.lockAspect
                    ? clampDimension((height ?? 0) * ratio)
                    : clampDimension(crop.width),
                height: clampDimension(height ?? 0),
            };
        }
    }
}

/**
 * Everything the renderer needs.
 *
 * The fit mode is the only place the three answers differ, and each loses
 * something different:
 *
 * - `stretch` puts the crop on the canvas corner to corner. Nothing is lost and
 *   everything is distorted.
 * - `contain` scales until the crop fits **inside**, and the leftover is
 *   background. Nothing is cut, which is why it is the default and why every
 *   document-photo preset asks for it: a passport office rejects a photograph
 *   with the top of a head missing.
 * - `cover` scales until the crop **fills** the canvas, and the overflow falls
 *   off the long edge. `clips` says so, so the UI can too.
 *
 * A crop that lands at exactly its own size sets `resamples: false`, and that
 * is the tool's headline promise made checkable rather than claimed: no
 * resampling happened, so no pixel was interpolated with its neighbour.
 */
export function planRender(crop: CropRect, options: ResizeOptions): RenderPlan {
    const canvas = targetSize(crop, options);
    const matte = options.background === "color" ? parseHexColor(options.backgroundColor) : null;

    const draw = drawBox(crop, canvas, options);

    return {
        crop,
        canvas,
        draw,
        matte,
        resamples: draw.width !== crop.width || draw.height !== crop.height,
        clips: draw.width > canvas.width || draw.height > canvas.height,
    };
}

/**
 * Where the crop lands, in two steps: the shape `fit` asks for, then the zoom
 * over it.
 *
 * Zoom multiplies whatever the fit mode chose rather than replacing it, which
 * is what keeps the three modes meaning what they meant — `contain` at 100%
 * still fits inside, `stretch` at 100% still fills corner to corner — and makes
 * "push the edges past the frame and cut them" one number rather than a fourth
 * fit mode. Past 100% the box is wider than the canvas and `x` goes negative;
 * both the renderer and the preview clip against the canvas, so that is the
 * whole of the overflow behaviour.
 */
function drawBox(crop: CropRect, canvas: PixelSize, options: ResizeOptions) {
    const fitted = fitBox(crop, canvas, options.fit);
    const zoom = clampZoom(options.zoom) / 100;

    const width = Math.max(1, Math.round(fitted.width * zoom));
    const height = Math.max(1, Math.round(fitted.height * zoom));

    return {
        // Rounded rather than floored so a one-pixel remainder is split evenly
        // instead of always landing on the right and the bottom.
        x: Math.round((canvas.width - width) / 2),
        y: Math.round((canvas.height - height) / 2),
        width,
        height,
    };
}

function fitBox(crop: CropRect, canvas: PixelSize, fit: ResizeOptions["fit"]): PixelSize {
    if (fit === "stretch") {
        return { width: canvas.width, height: canvas.height };
    }

    const scaleX = canvas.width / crop.width;
    const scaleY = canvas.height / crop.height;
    const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

    return {
        width: Math.max(1, Math.round(crop.width * scale)),
        height: Math.max(1, Math.round(crop.height * scale)),
    };
}

/**
 * True when the plan asks for a canvas nothing should try to allocate.
 *
 * The source cap does not imply this one: a 1% crop of a small picture scaled
 * to 20000 × 20000 starts from almost nothing and still asks for 1.6 GB. Four
 * bytes a pixel is the real cost, and "after" is a dead tab.
 */
export function isOutputTooLarge(canvas: PixelSize): boolean {
    return canvas.width * canvas.height > MAX_OUTPUT_PIXELS;
}

/**
 * The same question asked of both boxes a render allocates, which zoom made
 * two different questions.
 *
 * The canvas is what gets written. The **draw** box is what the resampler is
 * asked to produce before a pixel of it is thrown away, and past 100% zoom it
 * is the larger of the two — a phone screenshot in a modest frame at 400% is
 * sixteen times the pixels the file will keep. Checking only the canvas would
 * pass that plan and then die inside Lanczos.
 */
export function isPlanTooLarge(plan: RenderPlan): boolean {
    return isOutputTooLarge(plan.canvas) || isOutputTooLarge(plan.draw);
}

/**
 * True when the output is a byte-for-byte copy of the cropped region — the
 * pixels, not the file.
 *
 * Nothing is scaled, nothing is padded, nothing falls off the edge. What the
 * encoder afterwards does to those pixels is a separate question the format
 * picker answers, and the copy in the UI keeps the two apart rather than
 * promising "lossless" and meaning half of it.
 */
export function copiesPixels(plan: RenderPlan): boolean {
    return (
        !plan.resamples &&
        !plan.clips &&
        plan.draw.x === 0 &&
        plan.draw.y === 0 &&
        plan.canvas.width === plan.draw.width &&
        plan.canvas.height === plan.draw.height
    );
}
