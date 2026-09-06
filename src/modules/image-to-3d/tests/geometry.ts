import type { Mesh } from "@/modules/image-to-3d/types";

/**
 * A vertex's position as a string, so two entries at the same point in space
 * count as one place.
 *
 * Watertightness is a property of the geometry, not of the index buffer: wall
 * quads carry their own vertices so they can be flat-shaded, and a cylinder's
 * two edge columns are one place with two texture coordinates. An edge count
 * keyed on indices would call every one of those a hole.
 */
export function positionKey(mesh: Mesh, vertex: number): string {
    // `+ 0` collapses negative zero. A cylinder's seam lands on sin(±π), which
    // is ∓1.2e-16 — the same point, printed as "-0.0000" on one side and
    // "0.0000" on the other, and therefore two places to anything keyed on the
    // string.
    const round = (value: number) => (Number(value.toFixed(4)) + 0).toFixed(4);

    return [
        round(mesh.positions[vertex * 3]),
        round(mesh.positions[vertex * 3 + 1]),
        round(mesh.positions[vertex * 3 + 2]),
    ].join(",");
}

/**
 * Every directed edge that is never answered by one going the other way.
 *
 * This is the hole detector, and it is the half that is easy to leave out: a
 * count of one per directed edge is equally true of a closed surface and of a
 * sheet with an open border, so counting alone proves nothing about either.
 */
export function unmatchedEdges(mesh: Mesh): string[] {
    const counts = directedEdgeCounts(mesh);

    return [...counts.keys()].filter((edge) => {
        const [from, to] = edge.split("|");

        return (counts.get(`${to}|${from}`) ?? 0) !== counts.get(edge);
    });
}

/**
 * How many times each directed edge appears, keyed by position.
 *
 * A closed, consistently wound surface uses every edge exactly once in each
 * direction. One direction twice means two triangles facing opposite ways
 * across the same edge; a direction missing means a hole.
 */
export function directedEdgeCounts(mesh: Mesh): Map<string, number> {
    const counts = new Map<string, number>();

    for (let index = 0; index < mesh.indices.length; index += 3) {
        const keys = [
            positionKey(mesh, mesh.indices[index]),
            positionKey(mesh, mesh.indices[index + 1]),
            positionKey(mesh, mesh.indices[index + 2]),
        ];

        for (let corner = 0; corner < 3; corner += 1) {
            const edge = `${keys[corner]}|${keys[(corner + 1) % 3]}`;

            counts.set(edge, (counts.get(edge) ?? 0) + 1);
        }
    }

    return counts;
}

/**
 * Six times the signed volume enclosed by the mesh, by the divergence theorem.
 *
 * Positive means the triangles face outward. This is the one check that catches
 * a whole surface wound backwards — normals and edge counts are both happy with
 * a model that is inside out.
 */
export function signedVolume(mesh: Mesh): number {
    let total = 0;

    for (let index = 0; index < mesh.indices.length; index += 3) {
        const a = mesh.indices[index] * 3;
        const b = mesh.indices[index + 1] * 3;
        const c = mesh.indices[index + 2] * 3;

        const crossX =
            mesh.positions[b + 1] * mesh.positions[c + 2] -
            mesh.positions[b + 2] * mesh.positions[c + 1];
        const crossY =
            mesh.positions[b + 2] * mesh.positions[c] - mesh.positions[b] * mesh.positions[c + 2];
        const crossZ =
            mesh.positions[b] * mesh.positions[c + 1] - mesh.positions[b + 1] * mesh.positions[c];

        total +=
            mesh.positions[a] * crossX +
            mesh.positions[a + 1] * crossY +
            mesh.positions[a + 2] * crossZ;
    }

    return total / 6;
}
