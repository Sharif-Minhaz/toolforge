import type { Mesh } from "../types";

/** Six little-endian floats and three bytes of colour. */
const VERTEX_BYTES = 27;

/** One count byte and three little-endian uint32 indices. */
const FACE_BYTES = 13;

/**
 * Binary little-endian PLY, in millimetres.
 *
 * The format that keeps colour without a second file: `red`, `green` and `blue`
 * ride on the vertex itself, so MeshLab, CloudCompare and Blender's own
 * importer show the picture on the model with nothing else in the folder. That
 * is the whole reason it is offered beside STL, which cannot, and OBJ, which
 * can only by carrying a texture alongside.
 *
 * `binary_little_endian` rather than `ascii`: the same mesh is roughly a fifth
 * the size and parses without a float round-trip through decimal.
 */
export function encodePly(mesh: Mesh, comment: string): Uint8Array {
    const vertices = mesh.positions.length / 3;
    const faces = mesh.indices.length / 3;

    const header = [
        "ply",
        "format binary_little_endian 1.0",
        // Comment lines are the only place the format allows provenance, and a
        // newline inside one would end the header early.
        `comment ${comment.replaceAll(/[\r\n]+/g, " ")}`,
        `element vertex ${vertices}`,
        "property float x",
        "property float y",
        "property float z",
        "property float nx",
        "property float ny",
        "property float nz",
        "property uchar red",
        "property uchar green",
        "property uchar blue",
        `element face ${faces}`,
        "property list uchar uint vertex_indices",
        "end_header",
        "",
    ].join("\n");

    const headerBytes = new TextEncoder().encode(header);
    const bytes = new Uint8Array(headerBytes.length + vertices * VERTEX_BYTES + faces * FACE_BYTES);

    bytes.set(headerBytes, 0);

    const view = new DataView(bytes.buffer);
    let offset = headerBytes.length;

    for (let vertex = 0; vertex < vertices; vertex += 1) {
        view.setFloat32(offset, mesh.positions[vertex * 3], true);
        view.setFloat32(offset + 4, mesh.positions[vertex * 3 + 1], true);
        view.setFloat32(offset + 8, mesh.positions[vertex * 3 + 2], true);
        view.setFloat32(offset + 12, mesh.normals[vertex * 3], true);
        view.setFloat32(offset + 16, mesh.normals[vertex * 3 + 1], true);
        view.setFloat32(offset + 20, mesh.normals[vertex * 3 + 2], true);
        bytes[offset + 24] = mesh.colors[vertex * 3];
        bytes[offset + 25] = mesh.colors[vertex * 3 + 1];
        bytes[offset + 26] = mesh.colors[vertex * 3 + 2];
        offset += VERTEX_BYTES;
    }

    for (let face = 0; face < faces; face += 1) {
        bytes[offset] = 3;
        view.setUint32(offset + 1, mesh.indices[face * 3], true);
        view.setUint32(offset + 5, mesh.indices[face * 3 + 1], true);
        view.setUint32(offset + 9, mesh.indices[face * 3 + 2], true);
        offset += FACE_BYTES;
    }

    return bytes;
}
