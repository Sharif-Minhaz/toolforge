/**
 * Which channel of the picture decides how high a point on the surface sits.
 *
 * `depth` is not a channel the file has: it is estimated by a model that reads
 * the picture as a scene, and it is the one that makes a snout stand nearer
 * than the ears. When the estimate is not to be had the heightfield falls back
 * to brightness and the page says so.
 *
 * A literal union rather than a string so `t(`sources.${source}Name`)` stays
 * type-checked, and so the search-param schema has one place to read from.
 */
export const HEIGHT_SOURCES = ["depth", "luminance", "alpha", "red", "green", "blue"] as const;

export type HeightSource = (typeof HEIGHT_SOURCES)[number];

/**
 * What the picture is turned into.
 *
 * `inflate` is the one that makes a body rather than a plate: the cut-out's
 * outline is pushed out into a rounded solid and mirrored behind itself, so the
 * result has a front, a back and a closed edge. The other two lay the same
 * heightfield on a surface and are what lithophanes, plaques and lamp shades
 * want. See `domain/silhouette.ts` for what inflation can and cannot claim.
 */
export const MODEL_SHAPES = ["inflate", "plane", "cylinder"] as const;

export type ModelShape = (typeof MODEL_SHAPES)[number];

export const MODEL_FORMATS = ["glb", "obj", "stl", "ply"] as const;

export type ModelFormat = (typeof MODEL_FORMATS)[number];

export type ModelOptions = {
    readonly source: HeightSource;
    /** Dark becomes high rather than low — lithophanes, and depth maps written near-is-black. */
    readonly invert: boolean;
    /** Blur passes over the heightfield, which is what removes JPEG noise spikes. */
    readonly smoothing: number;
    /** Samples along the picture's longest edge. Vertex count grows with its square. */
    readonly resolution: number;
    readonly shape: ModelShape;
    /** Millimetres across. On a cylinder this is the circumference, not the diameter. */
    readonly width: number;
    /**
     * Millimetres between the lowest and highest point of the relief — and, on
     * an inflated body, the full thickness through its deepest point.
     */
    readonly depth: number;
    /**
     * How much of an inflated body's bulge is handed over to the picture's own
     * relief, 0–1. Nothing to do with the other two shapes, which are relief all
     * the way through.
     */
    readonly detail: number;
    /** Off leaves an open surface with no back and no walls — a sheet, not a solid. */
    readonly solid: boolean;
    /** Millimetres of material behind the lowest point of the relief. */
    readonly baseThickness: number;
    readonly format: ModelFormat;
};

/**
 * Everything that shapes the mesh — which is `ModelOptions` minus the format.
 *
 * Its own type rather than a comment, because the distinction is load-bearing
 * twice over: the builder must not be handed a reason to re-run when only the
 * download format changed, and the page must not tear down a WebGL scene the
 * reader has just finished orbiting to answer a question about file extensions.
 */
export type MeshOptions = Omit<ModelOptions, "format">;

/**
 * The picture reduced to one height per grid cell, plus the colour that cell
 * averaged to. Row 0 is the top of the picture, as it is in `ImageData`.
 *
 * `colors` rides along rather than being sampled again later because both come
 * from the same box average, and re-sampling would let the two disagree by a
 * rounding on a picture whose grid does not divide its pixels evenly.
 */
export type Heightfield = {
    readonly columns: number;
    readonly rows: number;
    /** `columns * rows` values in 0..1, row-major. */
    readonly heights: Float32Array;
    /** `columns * rows * 3` bytes of straight RGB, row-major. */
    readonly colors: Uint8Array;
    /**
     * `columns * rows` opacities in 0..1, whatever the chosen height source.
     *
     * Kept beside the heights rather than derived from them because the
     * silhouette is a different question from the relief: a body is inflated
     * from where the subject *is*, and that is the alpha channel even when the
     * heights are being read out of the green one.
     */
    readonly alpha: Float32Array;
};

/**
 * An indexed triangle mesh in millimetres, Y up, right-handed — the convention
 * every one of the four writers converts *out* of rather than into, so there is
 * one orientation to reason about instead of four.
 */
export type Mesh = {
    /** `vertexCount * 3` millimetres. */
    readonly positions: Float32Array;
    /** `vertexCount * 3`, unit length. */
    readonly normals: Float32Array;
    /** `vertexCount * 2`, glTF convention: v grows downward from the picture's top row. */
    readonly uvs: Float32Array;
    /** `vertexCount * 3` bytes of straight RGB. */
    readonly colors: Uint8Array;
    /** `triangleCount * 3` vertex indices, counter-clockwise seen from outside. */
    readonly indices: Uint32Array;
};

export type MeshStats = {
    readonly vertices: number;
    readonly triangles: number;
};

/**
 * Why a model could not be built. Named for the cause rather than for the
 * control that provoked it — the triangle ceiling is reachable from the
 * resolution stepper and from a very wide picture alike.
 */
export type ModelRefusal = "empty_image" | "too_many_triangles";

export type MeshResult =
    | { readonly ok: true; readonly mesh: Mesh; readonly stats: MeshStats }
    | { readonly ok: false; readonly reason: ModelRefusal; readonly triangles?: number };

/**
 * The source picture as glTF is allowed to embed it.
 *
 * glTF 2.0 permits exactly two image types, so a WebP or an AVIF has to be
 * re-encoded by the caller before it gets here. Kept as a parameter rather than
 * read from a canvas in this layer, which has none.
 */
export type ModelTexture = {
    readonly bytes: Uint8Array;
    readonly mimeType: "image/png" | "image/jpeg";
};
