/**
 * Area-weighted vertex normals.
 *
 * The face contribution is the raw cross product rather than a normalised one,
 * which is what makes it area-weighted: a large triangle should have more say
 * in the direction a shared vertex faces than a sliver does. A sphere's pole
 * fan and a rounded box's corners are all slivers, so normalising first puts
 * them in charge of the shading.
 *
 * A vertex no triangle touches, or one whose triangles cancel out, is given
 * +Z rather than left at zero: a zero normal makes a renderer paint the
 * triangle black, and a wrong-but-unit normal is a shading artefact instead of
 * a hole.
 */
export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
    const normals = new Float32Array(positions.length);

    for (let index = 0; index < indices.length; index += 3) {
        const a = indices[index] * 3;
        const b = indices[index + 1] * 3;
        const c = indices[index + 2] * 3;

        const abx = positions[b] - positions[a];
        const aby = positions[b + 1] - positions[a + 1];
        const abz = positions[b + 2] - positions[a + 2];

        const acx = positions[c] - positions[a];
        const acy = positions[c + 1] - positions[a + 1];
        const acz = positions[c + 2] - positions[a + 2];

        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;

        for (const vertex of [a, b, c]) {
            normals[vertex] += nx;
            normals[vertex + 1] += ny;
            normals[vertex + 2] += nz;
        }
    }

    for (let vertex = 0; vertex < normals.length; vertex += 3) {
        const length = Math.hypot(normals[vertex], normals[vertex + 1], normals[vertex + 2]);

        if (length === 0) {
            normals[vertex + 2] = 1;

            continue;
        }

        normals[vertex] /= length;
        normals[vertex + 1] /= length;
        normals[vertex + 2] /= length;
    }

    return normals;
}
