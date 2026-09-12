import type { Mesh, ModelTexture } from "../types";
import { MILLIMETRES_PER_METRE } from "./constants";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_INT = 5125;
const COMPONENT_UNSIGNED_BYTE = 5121;

const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

const MODE_TRIANGLES = 4;

const FILTER_LINEAR = 9729;
const FILTER_LINEAR_MIPMAP_LINEAR = 9987;
const WRAP_CLAMP_TO_EDGE = 33071;

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

/**
 * glTF 2.0 binary.
 *
 * The one place in this module that does not measure in millimetres. glTF's
 * unit is the metre and there is no field to say otherwise, so the positions
 * are divided on the way out and a hundred-millimetre plate arrives in Blender
 * as 0.1 — correct, and small enough that it looks like a mistake to anyone who
 * has not been told. The article and the format picker both say so, because the
 * alternative is a file that is wrong by a factor of a thousand everywhere the
 * unit is actually respected.
 *
 * With a texture the material samples the picture. Without one the picture is
 * still not lost: the per-vertex colours go in as `COLOR_0` instead, padded to
 * four components because glTF requires every vertex attribute element to be
 * four-byte aligned and a three-byte one is not.
 */
export function encodeGlb(
    mesh: Mesh,
    texture: ModelTexture | null,
    options: { generator: string; name: string },
): Uint8Array {
    const vertices = mesh.positions.length / 3;

    const positions = new Float32Array(mesh.positions.length);

    for (let index = 0; index < positions.length; index += 1) {
        positions[index] = mesh.positions[index] / MILLIMETRES_PER_METRE;
    }

    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

    for (let vertex = 0; vertex < vertices; vertex += 1) {
        for (let axis = 0; axis < 3; axis += 1) {
            const value = positions[vertex * 3 + axis];

            min[axis] = Math.min(min[axis], value);
            max[axis] = Math.max(max[axis], value);
        }
    }

    const specs: BufferViewSpec[] = [
        { bytes: bytesOf(positions), target: TARGET_ARRAY_BUFFER },
        { bytes: bytesOf(mesh.normals), target: TARGET_ARRAY_BUFFER },
        { bytes: bytesOf(mesh.uvs), target: TARGET_ARRAY_BUFFER },
        { bytes: bytesOf(mesh.indices), target: TARGET_ELEMENT_ARRAY_BUFFER },
    ];

    const attributes: Record<string, number> = { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 };

    const accessors: Record<string, unknown>[] = [
        {
            bufferView: 0,
            componentType: COMPONENT_FLOAT,
            count: vertices,
            type: "VEC3",
            min,
            max,
        },
        { bufferView: 1, componentType: COMPONENT_FLOAT, count: vertices, type: "VEC3" },
        { bufferView: 2, componentType: COMPONENT_FLOAT, count: vertices, type: "VEC2" },
        {
            bufferView: 3,
            componentType: COMPONENT_UNSIGNED_INT,
            count: mesh.indices.length,
            type: "SCALAR",
        },
    ];

    if (texture === null) {
        const rgba = new Uint8Array(vertices * 4);

        for (let vertex = 0; vertex < vertices; vertex += 1) {
            rgba[vertex * 4] = mesh.colors[vertex * 3];
            rgba[vertex * 4 + 1] = mesh.colors[vertex * 3 + 1];
            rgba[vertex * 4 + 2] = mesh.colors[vertex * 3 + 2];
            rgba[vertex * 4 + 3] = 255;
        }

        attributes.COLOR_0 = accessors.length;
        accessors.push({
            bufferView: specs.length,
            componentType: COMPONENT_UNSIGNED_BYTE,
            normalized: true,
            count: vertices,
            type: "VEC4",
        });
        specs.push({ bytes: rgba, target: TARGET_ARRAY_BUFFER });
    }

    const textureView = texture === null ? null : specs.length;

    if (texture !== null) {
        specs.push({ bytes: texture.bytes });
    }

    const { buffer, views } = packBuffer(specs);

    const gltf: Record<string, unknown> = {
        asset: { version: "2.0", generator: options.generator },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, name: options.name }],
        meshes: [
            {
                name: options.name,
                primitives: [{ attributes, indices: 3, material: 0, mode: MODE_TRIANGLES }],
            },
        ],
        materials: [
            {
                name: "surface",
                pbrMetallicRoughness: {
                    ...(texture === null
                        ? { baseColorFactor: [1, 1, 1, 1] }
                        : { baseColorTexture: { index: 0 } }),
                    metallicFactor: 0,
                    // Not 1. A fully rough surface loses the shallow shading
                    // that shows the relief at all, which is the one thing the
                    // model exists to carry.
                    roughnessFactor: 0.85,
                },
                // A PNG texture is a cut-out, and a cut-out's transparent
                // background hides whatever RGB the encoder found cheapest to
                // store. glTF defaults to OPAQUE, which would paint that
                // patchwork onto the outline ring in Blender exactly as an
                // unmasked preview did. MASK at half opacity discards it and
                // keeps the material a solid rather than a blended one.
                ...(texture?.mimeType === "image/png"
                    ? { alphaMode: "MASK", alphaCutoff: 0.5 }
                    : {}),
            },
        ],
        accessors,
        bufferViews: views,
        buffers: [{ byteLength: buffer.byteLength }],
    };

    if (texture !== null && textureView !== null) {
        gltf.samplers = [
            {
                magFilter: FILTER_LINEAR,
                minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
                // The picture is stretched exactly once across the surface, so
                // repeating at the edge would only ever wrap a filtered pixel
                // round to the far side and draw a line there.
                wrapS: WRAP_CLAMP_TO_EDGE,
                wrapT: WRAP_CLAMP_TO_EDGE,
            },
        ];
        gltf.textures = [{ sampler: 0, source: 0 }];
        gltf.images = [{ bufferView: textureView, mimeType: texture.mimeType }];
    }

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
