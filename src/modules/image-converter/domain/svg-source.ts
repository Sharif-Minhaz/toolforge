import { browserCanvasFactory, type CanvasFactory } from "@/modules/tools/domain/image-codec";
import { loadImageElement } from "@/modules/tools/domain/image-element";
import { normalizeImageType } from "@/modules/tools/domain/image-file";
import type { PixelSize } from "@/modules/tools/types";

/**
 * Turning markup into pixels, which is a different job from decoding a file.
 *
 * Every other source this tool takes arrives as a grid with a size of its own.
 * An SVG arrives as a description, and somebody has to decide how big to draw
 * it — so the whole of this file is about answering that question honestly and
 * then getting the browser to honour the answer.
 *
 * ## Why an `<img>` and not the document
 *
 * SVG is markup, and markup can carry scripts, event handlers and references to
 * other people's servers. None of that runs here, and the reason is a guarantee
 * from the platform rather than a filter of ours: an SVG referenced as an
 * *image* — `<img>`, a CSS background, anything that is not `<object>`,
 * `<embed>`, an `<iframe>` or the document itself — is rendered in **secure
 * static mode**. No script executes, no external resource is fetched, and no
 * interaction is dispatched. That is why the file is only ever handed to an
 * `<img>` through a blob URL, and never parsed into this page's DOM.
 *
 * Two consequences worth knowing, both of which belong in the article as well:
 * an SVG that pulls a bitmap or a font in over the network loses it, and a
 * browser that fetched one anyway would taint the canvas — `getImageData` then
 * throws, and the file is reported as undecodable rather than half-converted.
 *
 * ## Why the markup is rewritten before it is drawn
 *
 * An SVG with no `width` and `height` has no intrinsic size, and Firefox
 * reports exactly that: a zero-sized image, drawn as nothing. Setting the
 * attributes on the element does not help, because the *image's* own size is
 * what a canvas draw reads. So the root tag is rewritten with the size this
 * tool decided on before the blob is made, which also means the browser
 * rasterises the vector at that size rather than scaling a small raster up.
 */

export const SVG_MIME_TYPE = "image/svg+xml";

/**
 * What an SVG with nothing to go on is drawn at.
 *
 * A file with neither `width`/`height` nor a `viewBox` is legal and does exist —
 * hand-written icons and a few export pipelines omit both. 512 is large enough
 * that the result is worth converting and small enough to never be the reason a
 * tab runs out of memory.
 */
export const SVG_FALLBACK_EDGE = 512;

/** The lengths CSS calls absolute, in pixels. Everything else is unresolvable. */
const ABSOLUTE_UNITS: Record<string, number> = {
    px: 1,
    pt: 96 / 72,
    pc: 16,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    q: 96 / 101.6,
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const ATTRIBUTE_PATTERN = /([:A-Za-z_][-.:\w]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * The declared type, corrected for a picker that did not recognise the file.
 *
 * Every browser in use maps `.svg` to `image/svg+xml`, but a file dragged out of
 * an archive tool or a network share can arrive with an empty type or with the
 * catch-all binary one. The `accept` attribute lists the extension as well as
 * the type, so the gate has to agree with the picker or a file the reader was
 * allowed to choose would be refused the moment they chose it.
 *
 * Only that one direction is corrected. A `.png` that declares itself an SVG is
 * left declaring it, because the decoder reads the bytes either way.
 */
export function resolveImageType(file: { readonly type: string; readonly name: string }): string {
    const declared = normalizeImageType(file.type);

    if (declared !== "" && declared !== "application/octet-stream") {
        return declared;
    }

    return /\.svg$/i.test(file.name) ? SVG_MIME_TYPE : declared;
}

export function isSvgSource(file: { readonly type: string; readonly name: string }): boolean {
    return resolveImageType(file) === SVG_MIME_TYPE;
}

/**
 * A length in an SVG attribute, in pixels, or `null` when it depends on
 * something this tool does not have.
 *
 * `50%` and `2em` are both legal and both unanswerable outside a layout, so they
 * are refused rather than guessed at — the `viewBox` is a better source for the
 * size in exactly those files anyway.
 */
export function parseSvgLength(raw: string | undefined): number | null {
    if (raw === undefined) {
        return null;
    }

    const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*([a-z%]*)\s*$/i.exec(raw);

    if (match === null) {
        return null;
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }

    if (unit === "") {
        return value;
    }

    const factor = ABSOLUTE_UNITS[unit];

    return factor === undefined ? null : value * factor;
}

/** The `viewBox`'s own width and height, which is the picture's aspect ratio. */
export function parseViewBox(raw: string | undefined): PixelSize | null {
    if (raw === undefined) {
        return null;
    }

    const parts = raw
        .trim()
        .split(/[\s,]+/)
        .map(Number);

    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
        return null;
    }

    const [, , width, height] = parts;

    return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The size the file itself claims, or `null` when it claims none.
 *
 * `width` and `height` win where both are given, because that is the size the
 * author drew at. One of them plus a `viewBox` still answers the question — the
 * box supplies the ratio — and a `viewBox` alone answers it outright.
 */
export function readSvgIntrinsicSize(attributes: ReadonlyMap<string, string>): PixelSize | null {
    const width = parseSvgLength(attributes.get("width"));
    const height = parseSvgLength(attributes.get("height"));

    if (width !== null && height !== null) {
        return { width, height };
    }

    const box = parseViewBox(attributes.get("viewbox"));

    if (box === null) {
        return null;
    }

    if (width !== null) {
        return { width, height: (width * box.height) / box.width };
    }

    if (height !== null) {
        return { width: (height * box.width) / box.height, height };
    }

    return box;
}

/**
 * The pixel grid an SVG is drawn onto.
 *
 * `edge` is a target rather than a cap, and that is the one place SVG parts
 * company with every other source here. A raster is capped because enlarging it
 * invents detail; a vector has no pixels to lose, so being asked for a 2048 icon
 * from a 24-pixel drawing is a request the format can actually honour. `null`
 * means the file's own declared size, which is what "keep original" means for
 * something that declared one.
 */
export function svgRasterSize(intrinsic: PixelSize | null, edge: number | null): PixelSize {
    const base = intrinsic ?? { width: SVG_FALLBACK_EDGE, height: SVG_FALLBACK_EDGE };
    const longest = Math.max(base.width, base.height);

    if (longest <= 0) {
        return { width: SVG_FALLBACK_EDGE, height: SVG_FALLBACK_EDGE };
    }

    if (edge === null || edge <= 0) {
        return roundSize(base);
    }

    const scale = edge / longest;

    return roundSize({ width: base.width * scale, height: base.height * scale });
}

function roundSize(size: PixelSize): PixelSize {
    return {
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height)),
    };
}

/**
 * Shrinks a grid until it fits in a pixel budget, keeping its proportions.
 *
 * A raster that holds too many pixels is refused, because there is nothing else
 * to do with it — the file is what it is. A vector is different: `width="40000"`
 * is a number in a text file rather than 6 GB of memory somebody already spent,
 * and drawing it at the largest grid this tab will hold is a better answer than
 * turning the file away. So this is a clamp rather than a refusal.
 */
export function clampToPixels(size: PixelSize, maxPixels: number): PixelSize {
    const total = size.width * size.height;

    if (!Number.isFinite(maxPixels) || maxPixels <= 0 || total <= maxPixels) {
        return size;
    }

    const scale = Math.sqrt(maxPixels / total);

    // Floored rather than rounded: rounding both edges up lands back over the
    // budget, which is the one thing this function exists to prevent.
    return {
        width: Math.max(1, Math.floor(size.width * scale)),
        height: Math.max(1, Math.floor(size.height * scale)),
    };
}

/** The root `<svg …>` tag, located without an XML parser. */
type SvgRootTag = {
    readonly attributes: ReadonlyMap<string, string>;
    /** Index of the `<`. */
    readonly start: number;
    /** Index one past the `>`. */
    readonly end: number;
    readonly selfClosing: boolean;
};

/**
 * Finds the opening `<svg>` tag and reads its attributes.
 *
 * Scanned rather than parsed, and scanned with quote state tracked, because a
 * `>` inside an attribute value is legal and a regex that stops at the first one
 * would cut the tag in half. Attribute names are lowercased for lookup, so
 * `viewBox` is found under `viewbox`; what goes back out is written in the
 * spelling SVG requires.
 */
export function findSvgRootTag(markup: string): SvgRootTag | null {
    const opening = /<svg(?=[\s/>])/i.exec(markup);

    if (opening === null) {
        return null;
    }

    const start = opening.index;
    let quote: string | null = null;

    for (let index = start + 4; index < markup.length; index += 1) {
        const character = markup[index];

        if (quote !== null) {
            if (character === quote) {
                quote = null;
            }

            continue;
        }

        if (character === '"' || character === "'") {
            quote = character;

            continue;
        }

        if (character === ">") {
            const inner = markup.slice(start + 4, index);
            const attributes = new Map<string, string>();

            for (const match of inner.matchAll(ATTRIBUTE_PATTERN)) {
                attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? "");
            }

            return {
                attributes,
                start,
                end: index + 1,
                selfClosing: inner.trimEnd().endsWith("/"),
            };
        }
    }

    return null;
}

/**
 * The size a file says it is, without touching it.
 *
 * `null` means there is no `<svg>` root to read — the file is not SVG whatever
 * its name says. A root with nothing to go on still answers, with the fallback
 * square, because "this drawing does not say how big it is" is not the same
 * fault as "this is not a drawing".
 */
export function readSvgSize(markup: string): PixelSize | null {
    const root = findSvgRootTag(markup);

    return root === null ? null : svgRasterSize(readSvgIntrinsicSize(root.attributes), null);
}

export type PreparedSvg = {
    /** The markup with an explicit size, ready to become a blob. */
    readonly markup: string;
    /** The grid it will be drawn onto. */
    readonly size: PixelSize;
};

/**
 * Rewrites the root tag so the file has exactly the size this tool wants.
 *
 * Three attributes are decided here and every other one is left alone:
 *
 * - `width` and `height` are replaced, never merely added, because the existing
 *   pair is what the browser would otherwise honour.
 * - `viewBox` is kept where there is one and synthesised from the declared size
 *   where there is not. Without it, changing the width only makes the canvas
 *   bigger — the drawing stays the size it was, in the corner.
 * - `xmlns` is added if it is missing. A file without it is not SVG as far as
 *   an XML parser is concerned, and an `<img>` renders it as nothing.
 */
export function prepareSvgMarkup(
    markup: string,
    edge: number | null,
    maxPixels = Number.POSITIVE_INFINITY,
): PreparedSvg | null {
    const root = findSvgRootTag(markup);

    if (root === null) {
        return null;
    }

    const intrinsic = readSvgIntrinsicSize(root.attributes);
    const size = clampToPixels(svgRasterSize(intrinsic, edge), maxPixels);
    const viewBox =
        root.attributes.get("viewbox") ??
        (intrinsic === null ? null : `0 0 ${intrinsic.width} ${intrinsic.height}`);

    const kept = [...root.attributes]
        .filter(([name]) => !["width", "height", "viewbox", "xmlns"].includes(name))
        .map(([name, value]) => `${name}="${escapeAttribute(value)}"`);

    const attributes = [
        `xmlns="${SVG_NAMESPACE}"`,
        ...kept,
        ...(viewBox === null ? [] : [`viewBox="${escapeAttribute(viewBox)}"`]),
        `width="${size.width}"`,
        `height="${size.height}"`,
    ].join(" ");

    const tag = `<svg ${attributes}${root.selfClosing ? " /" : ""}>`;

    return { markup: markup.slice(0, root.start) + tag + markup.slice(root.end), size };
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/**
 * Draws an SVG file onto a canvas and reads the pixels back.
 *
 * `null` for every failure — unreadable markup, an image the browser refused,
 * a canvas it will not give up — because the caller reports one thing to the
 * reader either way, and the alternative is four `try` blocks around one call.
 */
export async function rasterizeSvg(
    file: Blob,
    edge: number | null,
    maxPixels: number,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<ImageData | null> {
    const prepared = prepareSvgMarkup(await file.text(), edge, maxPixels);

    if (prepared === null) {
        return null;
    }

    const url = URL.createObjectURL(new Blob([prepared.markup], { type: SVG_MIME_TYPE }));

    try {
        const image = await loadImageElement(url);

        if (image === null) {
            return null;
        }

        const { width, height } = prepared.size;
        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");

        if (context === null) {
            return null;
        }

        context.drawImage(image, 0, 0, width, height);

        // Throws `SecurityError` if the browser fetched something cross-origin
        // for this drawing despite secure static mode. A refusal is the right
        // answer there — half a picture converted silently is not.
        return context.getImageData(0, 0, width, height);
    } catch {
        return null;
    } finally {
        URL.revokeObjectURL(url);
    }
}
