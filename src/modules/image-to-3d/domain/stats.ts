import type { MeshStats, ModelFormat } from "../types";

/**
 * Roughly how large the download will be, for the line under the format picker.
 *
 * An order of magnitude, not a promise: the ZIP's own overhead and the
 * per-part headers are ignored. STL is the odd one because it shares no
 * vertices at all — fifty bytes per triangle, whatever the mesh looked like
 * going in.
 */
export function estimateBytes(stats: MeshStats, format: ModelFormat): number {
    switch (format) {
        case "stl":
            return 84 + stats.triangles * 50;
        case "glb":
            // Six floats of attributes per vertex, three indices per triangle,
            // and a node, mesh and material of JSON per part.
            return 512 + stats.vertices * 24 + stats.triangles * 12 + stats.parts * 400;
        case "ply":
            return 512 + stats.vertices * 27 + stats.triangles * 13;
        case "obj":
            // Text, and the digits dominate: two lines per vertex at roughly
            // this width, plus a face line whose indices grow with the mesh.
            return 512 + stats.vertices * 64 + stats.triangles * 30 + stats.parts * 120;
    }
}
