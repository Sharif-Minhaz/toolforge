import type { MeshDetail, ModelFormat, ModelOptions } from "../types";

/** Millimetres from the ground to the top. The model's own estimate is the default. */
export const MIN_HEIGHT_MM = 10;
export const MAX_HEIGHT_MM = 2_000;

/**
 * The two settings that have a default before there is a model. The height
 * has none: it starts at the size of whatever the picture turns out to show.
 */
export const DEFAULT_SETTINGS: Pick<ModelOptions, "detail" | "format"> = {
    detail: "medium",
    format: "glb",
};

/** Around-the-axis segments for every curved part, per detail setting. */
export const RADIAL_SEGMENTS: Record<MeshDetail, number> = {
    low: 12,
    medium: 32,
    high: 64,
};

/** Rings from pole to pole on a sphere, and per quarter on a capsule's caps or a torus tube. */
export const ARC_SEGMENTS: Record<MeshDetail, number> = {
    low: 6,
    medium: 12,
    high: 24,
};

/**
 * What the action accepts.
 *
 * The browser downsizes before it uploads (`UPLOAD_EDGE`), so a file near
 * this ceiling only arrives from a script or a browser whose canvas refused.
 * The worker's own ceiling is two million base64 characters, about 1.5 MB of
 * bytes, and this stays under it so the refusal is ours and named.
 */
export const MAX_UPLOAD_BYTES = 1_400_000;

/** Longest edge of the picture the browser sends. The model reads at well under this. */
export const UPLOAD_EDGE = 768;

export const UPLOAD_JPEG_QUALITY = 0.86;

/** What the picker offers; the server re-checks every type. */
export const UPLOAD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** The intake accepts anything a browser can decode — it is re-encoded before upload. */
export const IMAGE_ACCEPT_ATTRIBUTE = "image/*";

/** Decoding ceiling for what the reader picks, before it is downsized. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export const IMAGE_FORM_FIELD = "image";
export const TOKEN_FORM_FIELD = "token";
export const TURNSTILE_ACTION = "image-to-3d";

/**
 * The model's longest answer in tokens.
 *
 * A 25-part object with three lathed profiles measured about 900 tokens with
 * thinking off. Six thousand is the worker's own ceiling and leaves room for
 * forty parts; a model that rambles past it ends `finish_reason: "length"` with
 * truncated JSON, which `parseObjectSpec` refuses as unreadable.
 */
export const MAX_COMPLETION_TOKENS = 6_000;

/**
 * Long enough for the slowest answer seen (18 s for nine parts, cold), with
 * room for forty parts and a queue. Past this the reader has waited long
 * enough to be told something.
 */
export const GENERATION_TIMEOUT_MS = 120_000;

/** Ceilings on what the model may hand back, enforced by `parseObjectSpec`. */
export const MAX_PARTS = 40;
export const MAX_PROFILE_POINTS = 24;
export const MAX_NAME_LENGTH = 48;

/**
 * Centimetres. Anything outside is a misread, not an object: a part a
 * millimetre wide is invisible at any print size, and nothing on a desk is
 * twenty metres tall.
 */
export const MIN_PART_CM = 0.05;
export const MAX_EXTENT_CM = 2_000;

/**
 * Two counters a day, per visitor and per deployment.
 *
 * Priced from the live runs: 31 neurons for a nine-part hydrant, so about 60 at
 * forty parts. The free plan is 10,000 a day **per Cloudflare account**, shared
 * with every other worker on it — the Watermark Remover's FLUX call alone costs
 * 1,500 — so the deployment ceiling is set to spend a third of the day on this
 * tool at the worst case, not all of it.
 */
export const GENERATION_LIMIT_PER_ADDRESS = 8;
export const GENERATION_LIMIT_PER_DEPLOYMENT = 60;
export const GENERATION_WINDOW_MS = 24 * 60 * 60 * 1_000;

/** What each format is written as, and what a browser should call it. */
export const FORMAT_EXTENSIONS: Record<ModelFormat, string> = {
    glb: "glb",
    // The OBJ and its material library travel together or the colours are lost.
    obj: "zip",
    stl: "stl",
    ply: "ply",
};

export const FORMAT_MIME_TYPES: Record<ModelFormat, string> = {
    glb: "model/gltf-binary",
    obj: "application/zip",
    stl: "model/stl",
    // PLY has no registered media type, and a made-up `model/ply` would only
    // mean something to this codebase.
    ply: "application/octet-stream",
};

/**
 * glTF measures in metres and this module measures in millimetres, so the GLB
 * writer — and only the GLB writer — divides by this.
 *
 * STL, OBJ and PLY are all unitless by specification, and the convention every
 * slicer and every CAD importer assumes for them is millimetres. Writing metres
 * into an STL to match the GLB would hand a printer a 0.1 mm model.
 */
export const MILLIMETRES_PER_METRE = 1000;
