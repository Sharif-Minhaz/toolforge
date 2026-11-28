import type { Mesh } from "../types";
import { MILLIMETRES_PER_METRE } from "./constants";
import { filePartNames } from "./filenames";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_INT = 5125;

const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

const MODE_TRIANGLES = 4;

/** Every chunk and every buffer view in a GLB starts on a four-byte boundary. */
function padTo4(length: number): number {
    return (4 - (length % 4)) % 4;
}

type BufferViewSpec = {
    readonly bytes: Uint8Array;
    readonly target?: number;
};

/**
 * Packs the views into one buffer, four-byte aligning each, and returns the
 * `bufferViews` array alongside it.
 */
function packBuffer(specs: readonly BufferViewSpec[]) {
    let total = 0;

    for (const spec of specs) {
        total += spec.bytes.byteLength + padTo4(spec.bytes.byteLength);
    }

    const buffer = new Uint8Array(total);
    const views: Record<string, number>[] = [];
    let offset = 0;

    for (const spec of specs) {
        buffer.set(spec.bytes, offset);
        views.push({
            buffer: 0,
            byteOffset: offset,
            byteLength: spec.bytes.byteLength,
            ...(spec.target === undefined ? {} : { target: spec.target }),
        });
        offset += spec.bytes.byteLength + padTo4(spec.bytes.byteLength);
    }

    return { buffer, views };
}

function bytesOf(array: Float32Array | Uint32Array | Uint8Array): Uint8Array {
    return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/** glTF's base colour is linear; a colour picked off a photograph is sRGB. */
export function srgbToLinear(channel: number): number {
    const value = channel / 255;

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * glTF 2.0 binary.
 *
 * The one place in this module that does not measure in millimetres. glTF's
 * unit is the metre and there is no field to say otherwise, so the positions
 * are divided on the way out and a 100 mm mug arrives in Blender as 0.1 —
 * correct, and small enough that it looks like a mistake to anyone who has not
 * been told. The format picker says so, because the alternative is a file that
 * is wrong by a factor of a thousand everywhere the unit is respected.
 *
 * **One node per part, each with its own material**, under one root named for
 * the object. That is what makes the file worth opening: Blender lists
 * "handle", "body" and "lid" in its outliner, each already coloured, rather
 * than one grey lump with a vertex-colour layer its default material ignores.
 * Each part's vertices are contiguous in the mesh, so each gets its own
 * accessors and its indices are rebased to start at zero.
 */
export function encodeGlb(mesh: Mesh, options: { generator: string; name: string }): Uint8Array {
    const specs: BufferViewSpec[] = [];
    const accessors: Record<string, unknown>[] = [];
    const meshes: Record<string, unknown>[] = [];
    const materials: Record<string, unknown>[] = [];
    const nodes: Record<string, unknown>[] = [{ name: options.name, children: [] as number[] }];

    const names = filePartNames(mesh.groups);

    mesh.groups.forEach((group, groupIndex) => {
        const name = names[groupIndex];
        const positions = new Float32Array(group.vertexCount * 3);
        const min: [number, number, number] = [Infinity, Infinity, Infinity];
        const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

        for (let offset = 0; offset < positions.length; offset += 1) {
            const value = mesh.positions[group.firstVertex * 3 + offset] / MILLIMETRES_PER_METRE;
            const axis = offset % 3;

            positions[offset] = value;
            min[axis] = Math.min(min[axis], value);
            max[axis] = Math.max(max[axis], value);
        }

        const normals = mesh.normals.slice(
            group.firstVertex * 3,
            (group.firstVertex + group.vertexCount) * 3,
        );
        const indices = new Uint32Array(group.indexCount);

        for (let index = 0; index < group.indexCount; index += 1) {
            indices[index] = mesh.indices[group.firstIndex + index] - group.firstVertex;
        }

        const firstAccessor = accessors.length;
        const firstView = specs.length;

        specs.push(
            { bytes: bytesOf(positions), target: TARGET_ARRAY_BUFFER },
            { bytes: bytesOf(normals), target: TARGET_ARRAY_BUFFER },
            { bytes: bytesOf(indices), target: TARGET_ELEMENT_ARRAY_BUFFER },
        );
        accessors.push(
            {
                bufferView: firstView,
                componentType: COMPONENT_FLOAT,
                count: group.vertexCount,
                type: "VEC3",
                // Required on POSITION by the specification, and what a
                // viewer frames the camera with.
                min,
                max,
            },
            {
                bufferView: firstView + 1,
                componentType: COMPONENT_FLOAT,
                count: group.vertexCount,
                type: "VEC3",
            },
            {
                bufferView: firstView + 2,
                componentType: COMPONENT_UNSIGNED_INT,
                count: group.indexCount,
                type: "SCALAR",
            },
        );

        materials.push({
            name,
            pbrMetallicRoughness: {
                baseColorFactor: [...group.color.map(srgbToLinear), 1],
                metallicFactor: 0,
                roughnessFactor: 0.7,
            },
        });
        meshes.push({
            name,
            primitives: [
                {
                    attributes: { POSITION: firstAccessor, NORMAL: firstAccessor + 1 },
                    indices: firstAccessor + 2,
                    material: materials.length - 1,
                    mode: MODE_TRIANGLES,
                },
            ],
        });
        (nodes[0].children as number[]).push(nodes.length);
        nodes.push({ name, mesh: meshes.length - 1 });
    });

    const { buffer, views } = packBuffer(specs);

    const gltf: Record<string, unknown> = {
        asset: { version: "2.0", generator: options.generator },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes,
        meshes,
        materials,
        accessors,
        bufferViews: views,
        buffers: [{ byteLength: buffer.byteLength }],
    };

    const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
    // Padded with spaces rather than zeroes: the JSON chunk is required to be
    // valid text for its whole declared length, and a trailing NUL is not.
    const jsonPadding = padTo4(jsonBytes.length);
    const binPadding = padTo4(buffer.byteLength);

    const jsonLength = jsonBytes.length + jsonPadding;
    const binLength = buffer.byteLength + binPadding;
    const total = 12 + 8 + jsonLength + 8 + binLength;

    const glb = new Uint8Array(total);
    const view = new DataView(glb.buffer);

    view.setUint32(0, GLB_MAGIC, true);
    view.setUint32(4, GLB_VERSION, true);
    view.setUint32(8, total, true);

    view.setUint32(12, jsonLength, true);
    view.setUint32(16, CHUNK_JSON, true);
    glb.set(jsonBytes, 20);
    glb.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);

    const binHeader = 20 + jsonLength;

    view.setUint32(binHeader, binLength, true);
    view.setUint32(binHeader + 4, CHUNK_BIN, true);
    glb.set(buffer, binHeader + 8);

    return glb;
}
