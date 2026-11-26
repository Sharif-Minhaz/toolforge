import type { StripOptions } from "../types";

/**
 * A 50 MiB photo is a 100-megapixel RAW-sized JPEG. The whole file is held in
 * memory twice while it is rewritten, so past this a phone tab runs out.
 */
export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;

export const DEFAULT_STRIP_OPTIONS: StripOptions = {
    keepColorProfile: true,
    keepOrientation: true,
};

/** The orientation that means "as stored": writing it back would say nothing. */
export const UPRIGHT_ORIENTATION = 1;

/** A tag value longer than this is cut in the table; the full text is rarely readable anyway. */
export const MAX_TAG_TEXT_LENGTH = 400;

/** What the file picker offers. A hint to it, never a substitute for the signature check. */
export const PHOTO_ACCEPT =
    "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/tiff,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.tif,.tiff";

/**
 * Bytes an MCP caller may send. They arrive Base64-encoded inside a JSON body
 * capped at 2 MiB, at four bytes of envelope for every three of photo, so one
 * mebibyte of photo is what fits with room for the rest of the request.
 */
export const MAX_MCP_PHOTO_BYTES = 1_048_576;
