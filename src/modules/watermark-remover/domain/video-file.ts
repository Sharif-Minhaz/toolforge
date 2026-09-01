import { normalizeImageType } from "@/modules/tools/domain/image-file";
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, type AllowedVideoType } from "./video-constants";

/** The two things about a file that decide whether a run is worth starting. */
export type VideoFileFacts = {
    readonly name: string;
    readonly type: string;
    readonly size: number;
};

export type VideoFileRejection = "empty_file" | "unsupported_type" | "too_large";

export type VideoFileCheck =
    | { readonly ok: true; readonly type: AllowedVideoType }
    | { readonly ok: false; readonly reason: VideoFileRejection };

/**
 * What each accepted container is normally written with, used only when the
 * browser hands back no type at all.
 */
const EXTENSION_TYPES: Record<string, AllowedVideoType> = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    qt: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
};

function typeFromName(name: string): AllowedVideoType | null {
    const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];

    return extension === undefined ? null : (EXTENSION_TYPES[extension] ?? null);
}

function isAllowedVideoType(raw: string): raw is AllowedVideoType {
    return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(raw);
}

/**
 * Gate a clip before anything is decoded.
 *
 * Unlike the picture side, the name gets a vote. A browser reports `""` for a
 * Matroska file often enough — and for a QuickTime file on some systems — that
 * refusing on the type alone would turn away files this tool reads perfectly
 * well. The extension is consulted only when the type is missing, never to
 * override one the browser did supply: the bytes are still the source of truth,
 * and the demuxer will say so a moment later if the name lied.
 */
export function checkVideoFile(file: VideoFileFacts): VideoFileCheck {
    if (file.size <= 0) {
        return { ok: false, reason: "empty_file" };
    }

    const reported = normalizeImageType(file.type);
    const type = reported === "" ? typeFromName(file.name) : reported;

    if (type === null || !isAllowedVideoType(type)) {
        return { ok: false, reason: "unsupported_type" };
    }

    if (file.size > MAX_VIDEO_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    return { ok: true, type };
}
