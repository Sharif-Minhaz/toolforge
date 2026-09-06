import type { Mesh } from "../types";

/** 80 bytes of free-form header, then the count, then 50 bytes per triangle. */
const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

/**
 * Binary STL, in millimetres.
 *
 * The header must not begin with the word `solid`. There is no version field
 * and no magic number in this format, so every reader tells binary from ASCII
 * by looking at exactly those five bytes — and a binary file whose header
 * happens to start with them is parsed as text and rejected as corrupt. The
 * generator string is what goes there instead, which is also the only place
 * this format has to say where a file came from.
 *
 * The facet normal is written from the geometry rather than from the mesh's
 * own vertex normals: STL's normal is per face, and most readers ignore it and
 * re-derive it from the winding anyway. Writing an interpolated one would put a
 * value in the file that disagrees with the triangle beside it.
 */
export function encodeStl(mesh: Mesh, header: string): Uint8Array {
    const triangles = mesh.indices.length / 3;
    const bytes = new Uint8Array(HEADER_BYTES + 4 + triangles * TRIANGLE_BYTES);
    const view = new DataView(bytes.buffer);

    const label = new TextEncoder().encode(header);

    bytes.set(label.subarray(0, HEADER_BYTES), 0);
    view.setUint32(HEADER_BYTES, triangles, true);

    let offset = HEADER_BYTES + 4;

    for (let triangle = 0; triangle < triangles; triangle += 1) {
        const a = mesh.indices[triangle * 3] * 3;
        const b = mesh.indices[triangle * 3 + 1] * 3;
        const c = mesh.indices[triangle * 3 + 2] * 3;

        const abx = mesh.positions[b] - mesh.positions[a];
        const aby = mesh.positions[b + 1] - mesh.positions[a + 1];
        const abz = mesh.positions[b + 2] - mesh.positions[a + 2];
        const acx = mesh.positions[c] - mesh.positions[a];
        const acy = mesh.positions[c + 1] - mesh.positions[a + 1];
        const acz = mesh.positions[c + 2] - mesh.positions[a + 2];

        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const length = Math.hypot(nx, ny, nz);
        const scale = length === 0 ? 0 : 1 / length;

        view.setFloat32(offset, nx * scale, true);
        view.setFloat32(offset + 4, ny * scale, true);
        view.setFloat32(offset + 8, nz * scale, true);
        offset += 12;

        for (const vertex of [a, b, c]) {
            view.setFloat32(offset, mesh.positions[vertex], true);
            view.setFloat32(offset + 4, mesh.positions[vertex + 1], true);
            view.setFloat32(offset + 8, mesh.positions[vertex + 2], true);
            offset += 12;
        }

        // The attribute byte count. Some slicers read a packed colour here;
        // zero is what every reader agrees means "nothing to say".
        view.setUint16(offset, 0, true);
        offset += 2;
    }

    return bytes;
}
