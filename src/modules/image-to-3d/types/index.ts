/**
 * What a part can be built from.
 *
 * Deliberately few. Every shape here is one the vision model already has a
 * word for and one it can size by eye; a richer vocabulary (booleans, splines,
 * subdivision) only gave it more ways to answer with something the builder
 * then had to guess at. `lathe` is the escape hatch for anything turned —
 * bottles, vases, lamp bases, a hydrant's body — because a profile is a list of
 * numbers and a list of numbers is something a language model is good at.
 */
export const PART_SHAPES = [
    "box",
    "rounded_box",
    "cylinder",
    "cone",
    "sphere",
    "capsule",
    "torus",
    "lathe",
] as const;

export type PartShape = (typeof PART_SHAPES)[number];

/**
 * Which world axis a part's own long axis runs along.
 *
 * Its own field rather than a rotation, and that is the fix for the first live
 * run: asked for Euler angles, the model sized a hydrant's side nozzles as
 * upright cylinders and never turned them. Asked which way a part *points*, it
 * answers correctly — and the size stays a world-aligned box it can read
 * straight off the photograph.
 */
export const PART_AXES = ["x", "y", "z"] as const;

export type PartAxis = (typeof PART_AXES)[number];

export type Vector3 = readonly [number, number, number];

/** One primitive, as the model described it and after `parseObjectSpec` bounded it. */
export type ObjectPart = {
    readonly name: string;
    readonly shape: PartShape;
    readonly axis: PartAxis;
    /** Centimetres: the part's extent along world x, y and z before any tilt. */
    readonly size: Vector3;
    /** Centimetres: the centre of that box. */
    readonly position: Vector3;
    /** Degrees about x, y and z, applied in that order after the axis is chosen. */
    readonly tilt: Vector3;
    /**
     * Top width as a share of the bottom one, 0–1, along the part's axis.
     * Boxes and cylinders only: a box at 0.6 is a frustum, a cylinder at 0 is a
     * cone. Everything else ignores it.
     */
    readonly taper: number;
    /**
     * Lathe only: `[radius, height]` pairs from bottom to top, in any unit the
     * model liked. The builder normalises both to the part's own size, so a
     * profile written in centimetres and one written in percent come out alike.
     */
    readonly profile: readonly (readonly [number, number])[];
    /** Straight sRGB, 0–255. */
    readonly color: Vector3;
    /** Add a copy mirrored across x = 0 — the left leg, the other ear. */
    readonly mirror: boolean;
};

export type ObjectSpec = {
    readonly name: string;
    /** The object's real height as the model judged it, in centimetres. */
    readonly heightCm: number;
    readonly parts: readonly ObjectPart[];
};

/**
 * How finely curved parts are divided.
 *
 * A setting rather than a constant because the two readers of the file want
 * opposite things: a printer wants a smooth cylinder, and a game engine wants
 * the fewest triangles that still read as round.
 */
export const MESH_DETAILS = ["low", "medium", "high"] as const;

export type MeshDetail = (typeof MESH_DETAILS)[number];

export const MODEL_FORMATS = ["glb", "obj", "stl", "ply"] as const;

export type ModelFormat = (typeof MODEL_FORMATS)[number];

export type ModelOptions = {
    /** Millimetres from the ground to the top of the model. */
    readonly height: number;
    readonly detail: MeshDetail;
    readonly format: ModelFormat;
};

/**
 * One part's slice of the mesh.
 *
 * Every part's vertices and triangles are contiguous, which is what lets the
 * GLB writer give each one its own node and material, and the OBJ writer its
 * own `o` and `usemtl` — so the file opens in Blender as named, coloured
 * pieces rather than one grey lump.
 */
export type MeshGroup = {
    /** The model's own English name for the part — written into files as it is. */
    readonly name: string;
    readonly shape: PartShape;
    /** The copy `mirror` added. Same name in the file; the page labels it. */
    readonly mirrored: boolean;
    /** Straight sRGB, 0–255. */
    readonly color: Vector3;
    readonly firstVertex: number;
    readonly vertexCount: number;
    readonly firstIndex: number;
    readonly indexCount: number;
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
    /** `vertexCount * 3` bytes of straight RGB — each vertex carries its part's colour. */
    readonly colors: Uint8Array;
    /** `triangleCount * 3` vertex indices, counter-clockwise seen from outside. */
    readonly indices: Uint32Array;
    readonly groups: readonly MeshGroup[];
};

export type MeshStats = {
    readonly vertices: number;
    readonly triangles: number;
    readonly parts: number;
};

/**
 * Why the action could not answer with a model. Each keeps its own name
 * because each asks the reader for something different: a better photo, a
 * different file, a wait until tomorrow, or nothing at all.
 */
export const GENERATION_FAILURE_REASONS = [
    "missing_image",
    "empty_file",
    "unsupported_type",
    "too_large",
    "challenge_missing",
    "challenge_failed",
    "challenge_unavailable",
    "quota_unavailable",
    "rate_limited",
    "site_limited",
    "not_configured",
    "unauthorized",
    "invalid_request",
    "allowance_spent",
    "model_retired",
    "upstream_unavailable",
    "unreadable_response",
    "no_object",
] as const;

export type GenerationFailureReason = (typeof GENERATION_FAILURE_REASONS)[number];

export type GenerationResult =
    | { readonly ok: true; readonly spec: ObjectSpec }
    | { readonly ok: false; readonly reason: GenerationFailureReason };
