import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "../types";
import { toFilenameStem } from "./filenames";
import { normalizeImageType, withImageExtension } from "./image-file";

/**
 * The rules a "paste a picture's address" import has to satisfy, kept pure so
 * every one of them is unit-tested rather than trusted.
 *
 * This is the one path in the image tools that is not private, and the reason
 * is unavoidable: a cross-origin picture drawn into a canvas taints it, so
 * `getImageData` throws unless the host sent `Access-Control-Allow-Origin` —
 * which almost none do. The bytes therefore come through this server, which
 * makes the feature a server-side request forgery surface before it is a
 * convenience. `repository/remote-image.ts` is the half that resolves a name
 * and refuses a private address; this half is what a URL must look like, how
 * much may come back, and what the file is called afterwards.
 *
 * Every tool that takes a picture shares it, which is why it lives here.
 */

/**
 * Lower than the 25 MB a local pick is allowed, on purpose: these bytes cross
 * the network twice — once into this server, once back out to the reader — and
 * a URL import is a convenience rather than the tool's main road.
 */
export const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024;

/** A short identity field, so the input is capped rather than metered. */
export const MAX_REMOTE_IMAGE_URL_LENGTH = 2_048;

export const REMOTE_IMAGE_CONNECT_TIMEOUT_MS = 6_000;

export const REMOTE_IMAGE_TOTAL_TIMEOUT_MS = 15_000;

/**
 * Followed by hand, one at a time, each re-checked and re-guarded. Following
 * them automatically hands the destination to whoever wrote the `Location`
 * header, and a public URL that 302s to `169.254.169.254` defeats a check done
 * once. Three covers the `http → https → canonical host` chain a CDN uses.
 */
export const MAX_REMOTE_IMAGE_REDIRECTS = 3;

/** Per calling address, per window. */
export const REMOTE_IMAGE_LIMIT_PER_ADDRESS = 20;

/**
 * Per target host, per window, across every visitor. Not about abuse of this
 * site so much as abuse *through* it: without it, one link posted somewhere
 * busy turns this deployment into an unpaid mirror of somebody else's server.
 */
export const REMOTE_IMAGE_LIMIT_PER_HOST = 60;

export const REMOTE_IMAGE_WINDOW_MS = 60 * 1_000;

/**
 * The two things one import is counted against. Both, not either: the address
 * limit stops one visitor scripting the importer, and the host limit stops
 * every visitor together pointing it at one poor server.
 */
export type RemoteImageBucket = "address" | "host";

/**
 * Every way the import can be refused. Each member is also a message key in
 * both catalogues, so renaming one means renaming it in three places.
 */
export const REMOTE_IMAGE_PROBLEMS = [
    "invalid_url",
    "scheme_not_allowed",
    "blocked_address",
    "too_many_redirects",
    "not_an_image",
    "too_large",
    "empty_response",
    "timed_out",
    "upstream_failed",
    "rate_limited",
    "not_configured",
] as const;

export type RemoteImageProblem = (typeof REMOTE_IMAGE_PROBLEMS)[number];

/**
 * What crosses the action boundary on success.
 *
 * Base64 rather than raw bytes, for the same reason the Watermark Remover's
 * patch is: the island turns this straight into a `File` and an `<img>` source,
 * and the encoding is a serialisation detail either way.
 */
export type RemoteImage = {
    readonly dataUrl: string;
    readonly filename: string;
    readonly type: DecodableImageType;
    readonly bytes: number;
};

export type RemoteImageResult =
    | { readonly ok: true; readonly image: RemoteImage }
    | { readonly ok: false; readonly reason: RemoteImageProblem };

/**
 * The image type a response declares, or `null` if it declared something else.
 *
 * The header is trusted only to *refuse*, never to decode: nothing here acts on
 * the type beyond naming the file, and the decoder in the reader's tab reads
 * the bytes themselves. Parameters (`image/jpeg; charset=binary`) and odd
 * casing are stripped, because a correct server sending an unusual header is
 * not a reason to turn a picture away.
 */
export function remoteImageType(contentType: string | undefined): DecodableImageType | null {
    if (contentType === undefined) {
        return null;
    }

    const type = normalizeImageType(contentType);

    return (DECODABLE_IMAGE_TYPES as readonly string[]).includes(type)
        ? (type as DecodableImageType)
        : null;
}

/**
 * What to call the file a URL produced.
 *
 * The last path segment is the reader's best guess at a name, so it is kept
 * where there is one — decoded, stripped of its extension, and put through the
 * same sanitiser a picked file goes through. A URL with no path (`https://
 * example.com/`), or one whose last segment is empty, falls back to the host
 * rather than to a generic word: three pictures pulled from three sites are
 * then still told apart in a download folder.
 *
 * The extension always comes from the bytes' declared type, never from the
 * path — see `withImageExtension`.
 */
export function remoteImageFilename(url: URL, type: string): string {
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    const last = segments.at(-1);

    // Dots become hyphens in the host fallback, because `toFilenameStem` strips
    // what looks like an extension — and a file called `images.example` has
    // silently lost the part that said which site it came from.
    let candidate = url.hostname.replace(/\./g, "-");

    if (last !== undefined) {
        try {
            candidate = decodeURIComponent(last);
        } catch {
            // A malformed percent escape is not worth failing an import over.
            candidate = last;
        }
    }

    return withImageExtension(toFilenameStem(candidate), type);
}
