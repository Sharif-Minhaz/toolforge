import { toFilenameStem } from "@/modules/tools/domain/filenames";

import type { BackgroundChoice, CompositeFormat } from "../types";

/**
 * What the composite is called on the way to disk, and what it is written as.
 */

/**
 * The suffix names what happened rather than what the reader chose, and there are
 * only two of them: a cut-out with nothing behind it is `-cutout`, anything with a
 * background behind it is `-background`. Encoding the colour or the photograph's
 * id into the name was the first idea and it is worse — `photo-ff3b30.png` reads
 * as a hash, and three attempts at the same picture on three different Pexels
 * shots would produce names nobody can sort.
 *
 * No timestamp, unlike the ZIP names in `tools/domain/filenames.ts`: this is one
 * file the reader asked for by pressing a button next to the picture they can see,
 * and a second download of the same thing landing beside the first as
 * `photo-cutout (1).png` is the operating system's answer, which is the one they
 * already understand.
 */
export function buildCompositeFilename(
    originalName: string,
    background: BackgroundChoice,
    format: CompositeFormat,
): string {
    const suffix = background.kind === "transparent" ? "cutout" : "background";

    return `${toFilenameStem(originalName)}-${suffix}.${COMPOSITE_EXTENSIONS[format]}`;
}

export const COMPOSITE_EXTENSIONS: Record<CompositeFormat, string> = {
    png: "png",
    jpeg: "jpg",
    webp: "webp",
};

export const COMPOSITE_MIME_TYPES: Record<CompositeFormat, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
};

/**
 * How good a lossy composite is written.
 *
 * High, because the picture has already been through a decode and a resample by
 * the time it gets here and this is the last thing that touches it. `canvas`
 * quality is not comparable across formats — 0.92 in libjpeg and 0.92 in libwebp
 * are different amounts of loss — but both land near "cannot tell without
 * pixel-peeping", which is the intent.
 */
export const COMPOSITE_QUALITY = 0.92;

/**
 * Which format a background wants when the reader has not said.
 *
 * PNG for a cut-out with nothing behind it, because that is the only one where
 * losing the alpha channel loses the whole point. JPEG for everything else,
 * because once there is an opaque background the picture is photographic content
 * and a PNG of it is routinely five times the size for no visible gain — a real
 * cost paid by somebody who only wanted a white background.
 *
 * A default rather than a rule: the picker stays enabled either way, since a flat
 * colour behind a hard-edged subject is exactly where JPEG ringing shows, and the
 * reader can see their own picture and this cannot.
 */
export function defaultCompositeFormat(background: BackgroundChoice): CompositeFormat {
    return background.kind === "transparent" ? "png" : "jpeg";
}

/**
 * Whether a format can carry the cut-out's alpha channel.
 *
 * Drives the warning beside the picker rather than removing the option: choosing
 * JPEG for a transparent cut-out is a legitimate thing to want — it flattens onto
 * white, which is what a great deal of e-commerce software expects — but it must
 * never happen without the reader being told the transparency is going.
 */
export function keepsAlpha(format: CompositeFormat): boolean {
    return format !== "jpeg";
}
