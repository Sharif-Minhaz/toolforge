import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type AllowedImageType } from "./constants";

/**
 * The two things about a file that decide whether it is worth uploading. A
 * plain shape rather than a `File`, so the rule is testable without one.
 */
export type ImageFileFacts = {
    readonly type: string;
    readonly size: number;
};

export type ImageCheck =
    | { readonly ok: true; readonly type: AllowedImageType }
    | { readonly ok: false; readonly reason: "empty_file" | "unsupported_type" | "too_large" };

/**
 * `File.type` is normally a bare MIME type, but a value that arrived from a
 * form post can carry parameters (`image/jpeg; charset=binary`) or odd casing.
 * Both are stripped before matching, so a legitimate upload is not turned away
 * on punctuation.
 */
export function normalizeImageType(raw: string): string {
    return raw.split(";")[0].trim().toLowerCase();
}

export function isAllowedImageType(raw: string): raw is AllowedImageType {
    return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalizeImageType(raw));
}

/**
 * Gate a file against the worker's own limits before a request is worth making.
 *
 * Order matters. An empty file is reported as empty rather than as an
 * unsupported type: a browser hands back `type: ""` for a zero-byte pick, and
 * "that file is empty" is the fault the reader can actually act on.
 */
export function checkImageFile(file: ImageFileFacts): ImageCheck {
    if (file.size <= 0) {
        return { ok: false, reason: "empty_file" };
    }

    const type = normalizeImageType(file.type);

    if (!isAllowedImageType(type)) {
        return { ok: false, reason: "unsupported_type" };
    }

    if (file.size > MAX_IMAGE_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    return { ok: true, type };
}
