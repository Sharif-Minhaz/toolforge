import type {
    Mesh,
    MeshDetail,
    MeshGroup,
    MeshStats,
    ObjectPart,
    ObjectSpec,
    PartAxis,
    PartShape,
    Vector3,
} from "../types";
import { computeNormals } from "./normals";
import { buildPrimitive, type HalfExtents, type Patch } from "./primitives";

/**
 * The model's description, built into one mesh at the object's real size.
 *
 * Millimetres out, centimetres in: the model judges sizes in the unit people
 * use for objects on a desk, and every writer here speaks millimetres. The
 * result stands on y = 0 and is centred on x = z = 0 whatever the model said,
 * because a model that put the base at y = 3 or the middle at x = 12 still
 * meant an object standing on the ground in front of the camera.
 *
 * Parts are **not** unioned. They overlap, as blocked-out props do, and every
 * one of them is closed on its own — which is what a slicer, a game engine and
 * Blender all accept. A boolean union would be a geometry kernel, and the
 * article says plainly what overlapping shells mean for a print.
 */

const CENTIMETRES_TO_MILLIMETRES = 10;

/**
 * A mirrored part on the centre line would land on itself and double every
 * triangle. Closer to x = 0 than this share of its own width counts as "on the
 * line", and the copy is dropped.
 */
const CENTRE_LINE_SHARE = 0.25;

/**
 * The model sometimes describes both sides of a pair *and* marks one mirrored.
 * A copy whose centre lands within this share of its size of an existing part
 * of the same shape is that duplicate, and is dropped.
 */
const DUPLICATE_SHARE = 0.3;

type PlacedPart = {
    readonly part: ObjectPart;
    readonly mirrored: boolean;
};

/**
 * The part's own frame has its long axis on +y. These turn it onto the axis
 * the model named — proper rotations, so the winding survives — and say which
 * world extent becomes which local half-extent.
 */
function localExtents(size: Vector3, axis: PartAxis): HalfExtents {
    const [x, y, z] = size;

    switch (axis) {
        case "y":
            return { hx: x / 2, hy: y / 2, hz: z / 2 };
        case "x":
            // Local y → world x, local x → world −y.
            return { hx: y / 2, hy: x / 2, hz: z / 2 };
        case "z":
            // Local y → world z, local z → world −y.
            return { hx: x / 2, hy: z / 2, hz: y / 2 };
    }
}

function orient(x: number, y: number, z: number, axis: PartAxis): [number, number, number] {
    switch (axis) {
        case "y":
            return [x, y, z];
        case "x":
            return [y, -x, z];
        case "z":
            return [x, -z, y];
    }
}

/** Degrees about x, then y, then z — the order the prompt promises. */
function tiltMatrix(tilt: Vector3): number[] {
    const [ax, ay, az] = tilt.map((degrees) => (degrees * Math.PI) / 180);
    const [cx, sx, cy, sy, cz, sz] = [
        Math.cos(ax),
        Math.sin(ax),
        Math.cos(ay),
        Math.sin(ay),
        Math.cos(az),
        Math.sin(az),
    ];

    // Rz · Ry · Rx, row-major.
    return [
        cz * cy,
        cz * sy * sx - sz * cx,
        cz * sy * cx + sz * sx,
        sz * cy,
        sz * sy * sx + cz * cx,
        sz * sy * cx - cz * sx,
        -sy,
        cy * sx,
        cy * cx,
    ];
}

function isDuplicateOfExisting(copy: ObjectPart, parts: readonly ObjectPart[]): boolean {
    const [x, y, z] = copy.position;
    const reach = Math.max(...copy.size) * DUPLICATE_SHARE;

    return parts.some(
        (other) =>
            other !== copy &&
            other.shape === copy.shape &&
            Math.hypot(other.position[0] + x, other.position[1] - y, other.position[2] - z) <=
                reach,
    );
}

/** Every part, plus a mirrored copy of each one that asked for it and needs it. */
export function placeParts(parts: readonly ObjectPart[]): PlacedPart[] {
    const placed: PlacedPart[] = [];

    for (const part of parts) {
        placed.push({ part, mirrored: false });

        const onCentreLine = Math.abs(part.position[0]) < part.size[0] * CENTRE_LINE_SHARE;

        if (part.mirror && !onCentreLine && !isDuplicateOfExisting(part, parts)) {
            placed.push({ part, mirrored: true });
        }
    }

    return placed;
}

type BuiltPart = {
    readonly name: string;
    readonly shape: PartShape;
    readonly mirrored: boolean;
    readonly color: Vector3;
    readonly patches: Patch[];
};

/** One part, in world centimetres, mirrored if it is the copy. */
function buildPart({ part, mirrored }: PlacedPart, detail: MeshDetail): BuiltPart {
    const extents = localExtents(part.size, part.axis);
    const patches = buildPrimitive({
        shape: part.shape,
        extents,
        taper: part.taper,
        profile: part.profile,
        detail,
    });
    const matrix = tiltMatrix(part.tilt);
    const [px, py, pz] = part.position;

    const placed = patches.map((patch) => {
        const positions: number[] = [];

        for (let offset = 0; offset < patch.positions.length; offset += 3) {
            const [x, y, z] = orient(
                patch.positions[offset],
                patch.positions[offset + 1],
                patch.positions[offset + 2],
                part.axis,
            );
            const tx = matrix[0] * x + matrix[1] * y + matrix[2] * z + px;
            const ty = matrix[3] * x + matrix[4] * y + matrix[5] * z + py;
            const tz = matrix[6] * x + matrix[7] * y + matrix[8] * z + pz;

            positions.push(mirrored ? -tx : tx, ty, tz);
        }

        // A reflection turns every triangle inside out; reversing each one's
        // corner order turns it back.
        const indices = mirrored
            ? patch.indices.map((_, index, all) => all[index - (index % 3) + [0, 2, 1][index % 3]])
            : patch.indices;

        return { positions, indices };
    });

    return { name: part.name, shape: part.shape, mirrored, color: part.color, patches: placed };
}

export type BuiltObject = {
    readonly mesh: Mesh;
    readonly stats: MeshStats;
};

/**
 * Builds the whole object, grounded and centred, at the real size the parts
 * describe.
 *
 * Returns `null` only when nothing at all could be built — every part
 * degenerate — which `parseObjectSpec` already makes all but impossible.
 */
export function buildObjectMesh(spec: ObjectSpec, detail: MeshDetail): BuiltObject | null {
    const built = placeParts(spec.parts)
        .map((placed) => buildPart(placed, detail))
        .filter((part) => part.patches.some((patch) => patch.indices.length > 0));

    if (built.length === 0) {
        return null;
    }

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let vertexCount = 0;
    let indexCount = 0;

    for (const part of built) {
        for (const patch of part.patches) {
            vertexCount += patch.positions.length / 3;
            indexCount += patch.indices.length;

            for (let offset = 0; offset < patch.positions.length; offset += 3) {
                for (let axis = 0; axis < 3; axis += 1) {
                    min[axis] = Math.min(min[axis], patch.positions[offset + axis]);
                    max[axis] = Math.max(max[axis], patch.positions[offset + axis]);
                }
            }
        }
    }

    // Grounded on the lowest point and centred across the footprint.
    const shift = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const colors = new Uint8Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    const groups: MeshGroup[] = [];
    let vertexCursor = 0;
    let indexCursor = 0;

    for (const part of built) {
        const firstVertex = vertexCursor;
        const firstIndex = indexCursor;

        for (const patch of part.patches) {
            const local = new Float32Array(patch.positions.length);

            for (let offset = 0; offset < patch.positions.length; offset += 1) {
                local[offset] =
                    (patch.positions[offset] + shift[offset % 3]) * CENTIMETRES_TO_MILLIMETRES;
            }

            const patchNormals = computeNormals(local, Uint32Array.from(patch.indices));

            positions.set(local, vertexCursor * 3);
            normals.set(patchNormals, vertexCursor * 3);

            for (let vertex = 0; vertex < local.length / 3; vertex += 1) {
                colors.set(part.color, (vertexCursor + vertex) * 3);
            }

            for (const index of patch.indices) {
                indices[indexCursor] = index + vertexCursor;
                indexCursor += 1;
            }

            vertexCursor += local.length / 3;
        }

        groups.push({
            name: part.name,
            shape: part.shape,
            mirrored: part.mirrored,
            color: part.color,
            firstVertex,
            vertexCount: vertexCursor - firstVertex,
            firstIndex,
            indexCount: indexCursor - firstIndex,
        });
    }

    return {
        mesh: { positions, normals, colors, indices, groups },
        stats: { vertices: vertexCount, triangles: indexCount / 3, parts: groups.length },
    };
}

/** Top of the model in millimetres — the height it was built at. */
export function meshHeight(mesh: Mesh): number {
    let top = 0;

    for (let offset = 1; offset < mesh.positions.length; offset += 3) {
        top = Math.max(top, mesh.positions[offset]);
    }

    return top;
}

/**
 * The same mesh at another height. Uniform, so the proportions the model
 * judged survive and the normals are still right as they are.
 */
export function scaleMesh(mesh: Mesh, height: number): Mesh {
    const current = meshHeight(mesh);

    if (current <= 0) {
        return mesh;
    }

    const factor = height / current;

    return { ...mesh, positions: mesh.positions.map((value) => value * factor) };
}
