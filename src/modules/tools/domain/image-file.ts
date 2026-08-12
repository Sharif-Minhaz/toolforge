import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "../types";

/**
 * The two things about a file that decide whether it is worth uploading. A plain
 * shape rather than a `File`, so the rule is testable without one.
 */
export type ImageFileFacts = {
    readonly type: string;
    readonly size: number;
};

/**
 * What a given tool's worker will accept. Passed in rather than fixed here:
 * every tool fronts a different model, and an inpainting endpoint has no reason
 * to take the same formats as a classifier.
 */
export type ImageFileLimits<T extends string = string> = {
    readonly allowedTypes: readonly T[];
    readonly maxBytes: number;
};

export type ImageFileRejection = "empty_file" | "unsupported_type" | "too_large";

export type ImageFileCheck<T extends string = string> =
    | { readonly ok: true; readonly type: T }
    | { readonly ok: false; readonly reason: ImageFileRejection };

/**
 * `File.type` is normally a bare MIME type, but a value that arrived from a form
 * post can carry parameters (`image/jpeg; charset=binary`) or odd casing. Both
 * are stripped before matching, so a legitimate upload is not turned away on
 * punctuation.
 */
export function normalizeImageType(raw: string): string {
    return raw.split(";")[0].trim().toLowerCase();
}

export function isAllowedImageType<T extends string>(
    raw: string,
    allowedTypes: readonly T[],
): raw is T {
    return (allowedTypes as readonly string[]).includes(normalizeImageType(raw));
}

/**
 * Gate a file against a worker's own limits before a request is worth making.
 *
 * Order matters. An empty file is reported as empty rather than as an
 * unsupported type: a browser hands back `type: ""` for a zero-byte pick, and
 * "that file is empty" is the fault the reader can actually act on.
 */
export function checkImageFile<T extends string>(
    file: ImageFileFacts,
    limits: ImageFileLimits<T>,
): ImageFileCheck<T> {
    if (file.size <= 0) {
        return { ok: false, reason: "empty_file" };
    }

    const type = normalizeImageType(file.type);

    if (!isAllowedImageType(type, limits.allowedTypes)) {
        return { ok: false, reason: "unsupported_type" };
    }

    if (file.size > limits.maxBytes) {
        return { ok: false, reason: "too_large" };
    }

    return { ok: true, type };
}

/**
 * The extension each decodable type is normally written with.
 *
 * Wider than `RASTER_FORMAT_EXTENSIONS` in `image-codec.ts`, which covers only
 * the four formats this site can *write*. This one answers a different
 * question: what to call a file that arrived without a name — a clipboard paste
 * or a URL whose path ends in `/`.
 */
export const IMAGE_TYPE_EXTENSIONS: Record<DecodableImageType, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "image/bmp": "bmp",
};

export function isDecodableImageType(raw: string): raw is DecodableImageType {
    return isAllowedImageType(raw, DECODABLE_IMAGE_TYPES);
}

/** `null` rather than a guessed extension: a name with no suffix beats a wrong one. */
export function extensionForImageType(raw: string): string | null {
    const type = normalizeImageType(raw);

    return isDecodableImageType(type) ? IMAGE_TYPE_EXTENSIONS[type] : null;
}

/**
 * Puts the right extension on a stem, replacing one that disagrees with the
 * bytes.
 *
 * A URL ending `photo.jpg` that serves `image/png` is common enough — a CDN
 * that re-encodes on the fly does it — and saving those bytes as `.jpg` gives
 * the reader a file their own operating system opens with the wrong decoder.
 * The bytes are the source of truth; the path is a hint about the name.
 */
export function withImageExtension(stem: string, type: string): string {
    const extension = extensionForImageType(type);

    return extension === null ? stem : `${stem}.${extension}`;
}
